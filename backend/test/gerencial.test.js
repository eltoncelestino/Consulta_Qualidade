process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-gerencial';

const { afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const pool = {
  query: async () => {
    throw new Error('Database query was not mocked in the test.');
  }
};
const dbPath = require.resolve('../src/config/db');
const mockedDbModule = new Module(dbPath);
mockedDbModule.filename = dbPath;
mockedDbModule.loaded = true;
mockedDbModule.exports = pool;
require.cache[dbPath] = mockedDbModule;

const authMiddleware = require('../src/middlewares/auth');
const runSyncRobot = require('../src/cron/syncRobot');
const {
  validarFiltros,
  ErroValidacaoGerencial,
  obterPeriodoPadraoGerencial
} = require('../src/services/gerencialService');
const monitoriaController = require('../src/controllers/monitoriaController');
const gerencialController = require('../src/controllers/gerencialController');

const queryOriginal = pool.query;

afterEach(() => {
  pool.query = queryOriginal;
});

test('sincroniza novos funcionários sem nível e sem escopo gerencial', async () => {
  const senhaOriginal = process.env.DEFAULT_USER_PASSWORD;
  process.env.DEFAULT_USER_PASSWORD = 'temporary-test-password';
  let queryExecutada = '';
  let parametrosExecutados;
  pool.query = async (query, parametros) => {
    queryExecutada = query;
    parametrosExecutados = parametros;
    return [{ affectedRows: 1 }, []];
  };

  try {
    const resultado = await runSyncRobot();
    assert.equal(resultado.success, true);
    assert.equal(resultado.novosUsuarios, 1);
    assert.match(queryExecutada, /0 AS nivel/);
    assert.deepEqual(parametrosExecutados, ['temporary-test-password']);
    const contexto = authMiddleware.resolverContextoGerencial(
      { matricula: 'NOVO001', nome: 'NOVO ANALISTA', tipo_atend: 'N1_CHAT' },
      [{ nivel: 0, tipo: '' }]
    );
    assert.equal(contexto.perfilEfetivo, 'ANALISTA');
    assert.equal(contexto.permitido, false);
    assert.deepEqual(contexto.idsGrupos, []);
  } finally {
    if (senhaOriginal === undefined) delete process.env.DEFAULT_USER_PASSWORD;
    else process.env.DEFAULT_USER_PASSWORD = senhaOriginal;
  }
});

function respostaFake(finalizar) {
  return {
    statusCode: 200,
    body: null,
    status(codigo) {
      this.statusCode = codigo;
      if (codigo !== 200) finalizar();
      return this;
    },
    set() {
      return this;
    },
    json(conteudo) {
      this.body = conteudo;
      finalizar();
      return this;
    }
  };
}

async function consultarAcesso({ usuario, niveis }) {
  const resultados = [
    usuario ? [[usuario], []] : [[], []],
    [niveis || [], []]
  ];
  pool.query = async () => resultados.shift();
  const req = { user: usuario ? { matricula: usuario.matricula } : null, query: {}, params: {} };
  let finalizar;
  const concluido = new Promise(resolve => {
    finalizar = resolve;
  });
  const res = respostaFake(() => finalizar());

  if (!req.user) {
    authMiddleware.requireAcessoGerencial(req, res, () => assert.fail('Não deveria autorizar sem usuário.'));
  } else authMiddleware.requireAcessoGerencial(req, res, finalizar);
  await concluido;
  return { req, res };
}

test('permite gerenciar níveis somente a nível 1 ou gerente global', () => {
  const administrador = authMiddleware.resolverContextoGerencial(
    { matricula: '1001', nome: 'ADMIN TESTE', tipo_atend: 'N1_CHAT' },
    [{ nivel: 1, tipo: 'Administrador' }]
  );
  const gerente = authMiddleware.resolverContextoGerencial(
    { matricula: '1007', nome: 'Thiago Araujo da Costa (Potter)', tipo_atend: 'N1_CHAT' },
    []
  );
  const coordenador = authMiddleware.resolverContextoGerencial(
    { matricula: '1003', nome: 'Emanuela Ferreira Lopes', tipo_atend: 'N1_CHAT' },
    []
  );
  const executarMiddleware = contexto => {
    const res = {
      statusCode: 200,
      status(codigo) { this.statusCode = codigo; return this; },
      json(conteudo) { this.body = conteudo; return this; }
    };
    let chamouNext = false;
    authMiddleware.requireGerenciamentoAcessos({ contextoGerencial: contexto }, res, () => { chamouNext = true; });
    return { res, chamouNext };
  };

  assert.equal(executarMiddleware(administrador).chamouNext, true);
  assert.equal(executarMiddleware(gerente).chamouNext, true);
  const resultadoCoordenador = executarMiddleware(coordenador);
  assert.equal(resultadoCoordenador.chamouNext, false);
  assert.equal(resultadoCoordenador.res.statusCode, 403);
});

test('impede gerente de atribuir nível 1', async () => {
  const res = respostaFake(() => {});
  await gerencialController.alterarNivelAcesso({
    contextoGerencial: { niveisAcesso: [] },
    params: { matricula: '1002' },
    body: { nivel: 1 }
  }, res);
  assert.equal(res.statusCode, 403);
});

test('impede gerente de alterar uma conta que já é administradora', async () => {
  const getConnectionOriginal = pool.getConnection;
  let rollbackExecutado = false;
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async () => [[{ id: 12, nivel: 1 }], []],
    rollback: async () => { rollbackExecutado = true; },
    release: () => {}
  });

  try {
    const res = respostaFake(() => {});
    await gerencialController.alterarNivelAcesso({
      user: { matricula: 'GESTOR001' },
      contextoGerencial: { niveisAcesso: [] },
      params: { matricula: '1001' },
      body: { nivel: 2 }
    }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(rollbackExecutado, true);
  } finally {
    if (getConnectionOriginal === undefined) delete pool.getConnection;
    else pool.getConnection = getConnectionOriginal;
  }
});

test('permite gerente alterar o nível operacional de uma conta comum', async () => {
  const getConnectionOriginal = pool.getConnection;
  let atualizacaoExecutada = false;
  let transacaoConfirmada = false;
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (query, parametros) => {
      if (query.includes('SELECT l.id, l.nivel')) return [[{ id: 25, nivel: 0 }], []];
      atualizacaoExecutada = query.includes('UPDATE login_SQD SET nivel = ?');
      assert.deepEqual(parametros, [2, 25]);
      return [{ affectedRows: 1 }, []];
    },
    commit: async () => { transacaoConfirmada = true; },
    rollback: async () => {},
    release: () => {}
  });

  try {
    const res = respostaFake(() => {});
    await gerencialController.alterarNivelAcesso({
      user: { matricula: 'GESTOR001' },
      contextoGerencial: { niveisAcesso: [] },
      params: { matricula: '1002' },
      body: { nivel: 2 }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(atualizacaoExecutada, true);
    assert.equal(transacaoConfirmada, true);
  } finally {
    if (getConnectionOriginal === undefined) delete pool.getConnection;
    else pool.getConnection = getConnectionOriginal;
  }
});

test('classifica o gerente da Central como gerente mesmo com nível 1', async () => {
  const resultados = [
    [[{
      matricula: 'C005669',
      nome: 'THIAGO ARAUJO DA COSTA (POTTER)',
      grupo: 'OPERAÇÃO COMPLETA',
      tipo_atend: 'GESTAO',
      login_id: 1,
      nivel: 1,
      nivel_nome: 'Administrador'
    }], []],
    [[{ nivel: 1, tipo: 'Administrador' }], []]
  ];
  pool.query = async () => resultados.shift();
  const res = respostaFake(() => {});

  await gerencialController.getUsuariosAcesso({
    contextoGerencial: { niveisAcesso: [1] }
  }, res);

  assert.equal(res.body.usuarios[0].perfil, 'GERENTE');
  assert.equal(res.body.usuarios[0].nivel, 1);
  assert.equal(res.body.usuarios[0].podeAlterar, true);
});

test('exige autenticação e responde 401', async () => {
  const { res } = await consultarAcesso({ usuario: null, niveis: [] });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Autenticação obrigatória.' });
});

test('concede acesso global ao nível 1 e resolve o perfil efetivo de administrador', async () => {
  const { req, res } = await consultarAcesso({
    usuario: { matricula: '1001', nome: 'ANALISTA TESTE', tipo_atend: 'N1_CHAT' },
    niveis: [{ nivel: 1, tipo: 'Administrador' }]
  });
  assert.equal(res.statusCode, 200);
  assert.equal(req.contextoGerencial.perfilEfetivo, 'ADMINISTRADOR');
  assert.equal(req.contextoGerencial.podeAlternar, true);
  assert.equal(req.contextoGerencial.idsGrupos.length, 12);
});

test('nega escopo gerencial ao nível 3 sem torre mapeada', async () => {
  const usuario = { matricula: '1002', nome: 'LIDER TESTE', tipo_atend: 'N1_CHAT' };
  const { res } = await consultarAcesso({
    usuario,
    niveis: [{ nivel: 3, tipo: 'Líder' }]
  });
  assert.equal(res.statusCode, 403);
  const contexto = authMiddleware.resolverContextoGerencial(usuario, [{ nivel: 3, tipo: 'Líder' }]);
  assert.equal(contexto.perfilEfetivo, 'LIDER');
  assert.deepEqual(contexto.idsGrupos, []);
});

test('limita nível 3 listado como supervisor à sua torre', async () => {
  const { req, res } = await consultarAcesso({
    usuario: {
      matricula: '1006',
      nome: 'LAURIANO DOS SANTOS PEREIRA',
      tipo_atend: 'N1_CHAT'
    },
    niveis: [{ nivel: 3, tipo: 'Líder' }]
  });
  assert.equal(res.statusCode, 200);
  assert.equal(req.contextoGerencial.perfilEfetivo, 'SUPERVISOR');
  assert.deepEqual(req.contextoGerencial.idsGrupos, [7001]);
  assert.deepEqual(req.contextoGerencial.torres, ['ACESSO CORPORATIVO']);
});

test('concede escopo global ao gerente cadastrado', async () => {
  const { req, res } = await consultarAcesso({
    usuario: {
      matricula: '1007',
      nome: 'Thiago Araujo da Costa (Potter)',
      tipo_atend: 'N1_CHAT'
    },
    niveis: []
  });
  assert.equal(res.statusCode, 200);
  assert.equal(req.contextoGerencial.perfilEfetivo, 'GERENTE');
  assert.equal(req.contextoGerencial.idsGrupos.length, 12);
});

test('concede escopo da torre ao gestor permitido com nome normalizado', async () => {
  const { req, res } = await consultarAcesso({
    usuario: { matricula: '1003', nome: '  Emanuela Ferreira Lopes ', tipo_atend: 'N1_CHAT' },
    niveis: []
  });
  assert.equal(res.statusCode, 200);
  assert.equal(req.contextoGerencial.perfilEfetivo, 'COORDENADOR');
  assert.deepEqual(req.contextoGerencial.idsGrupos, [7004]);
});

test('nega acesso ao nível 4 sem papel de gestor', async () => {
  const { res } = await consultarAcesso({
    usuario: { matricula: '1004', nome: 'USUARIO SEM PERMISSAO', tipo_atend: 'N1_CHAT' },
    niveis: [{ nivel: 4, tipo: 'Líder Qualidade' }]
  });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Acesso gerencial não autorizado.' });
});

test('perfil duplo analista e administrador preserva alternância e precedência do administrador', async () => {
  const { req } = await consultarAcesso({
    usuario: { matricula: '1005', nome: 'ANALISTA ADMIN', tipo_atend: 'N2_CHAT' },
    niveis: [{ nivel: 2, tipo: 'Analista' }, { nivel: 1, tipo: 'Administrador' }]
  });
  assert.equal(req.contextoGerencial.perfilEfetivo, 'ADMINISTRADOR');
  assert.equal(req.contextoGerencial.analista, true);
  assert.equal(req.contextoGerencial.podeAlternar, true);
});

test('impede filtrar por grupo fora do escopo de torre', () => {
  const contexto = { idsGrupos: [7004] };
  assert.throws(
    () => validarFiltros({ modo: 'mes', periodo: '2026-01', grupo_id: '7009' }, contexto),
    error => error instanceof ErroValidacaoGerencial && error.status === 403
  );
});

test('usa o mês anterior como período padrão do dashboard para evitar meses vazios', () => {
  const periodoPadrao = obterPeriodoPadraoGerencial(new Date('2026-11-03T12:00:00Z'));
  assert.deepEqual(periodoPadrao, {
    ano: 2026,
    mes: '10',
    trimestre: '2026-Q4',
    periodo: '2026-10'
  });
});

test('usa a matrícula autenticada quando Express passa next ao controller de histórico', async () => {
  const chamadas = [];
  pool.query = async (sql, parametros = []) => {
    chamadas.push({ sql, parametros });
    if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
      return [[
        { COLUMN_NAME: 'matricula_analista' },
        { COLUMN_NAME: 'data_monitoria' },
        { COLUMN_NAME: 'nota_final' },
        { COLUMN_NAME: 'tma_dia' },
        { COLUMN_NAME: 'canal_atendimento' },
        { COLUMN_NAME: 'tipo_ticket' },
        { COLUMN_NAME: 'observacao' }
      ], []];
    }
    if (sql.includes('FROM monitorias m')) return [[], []];
    throw new Error('Unexpected SQL query in history regression test.');
  };

  const res = respostaFake(() => {});
  await monitoriaController.getHistorico(
    { user: { matricula: 'C018426' }, query: {} },
    res,
    () => {}
  );

  const consultaHistorico = chamadas.find(chamada => chamada.sql.includes('FROM monitorias m'));
  assert.equal(consultaHistorico.parametros[0], 'C018426');
  assert.equal(res.body.total, 0);
});
