const pool = require('../config/db');
const monitoriaController = require('./monitoriaController');
const gerencialService = require('../services/gerencialService');
const authMiddleware = require('../middlewares/auth');
const { GESTORES, normalizarNome } = require('../config/gestores');

exports.getPerfil = async (req, res) => {
  try {
    const grupos = await gerencialService.consultarGrupos(req.contextoGerencial);
    res.set('Cache-Control', 'private, no-store');
    return res.json({
      perfilEfetivo: req.contextoGerencial.perfilEfetivo,
      torres: req.contextoGerencial.torres,
      grupos,
      podeAlternar: req.contextoGerencial.podeAlternar,
      podeGerenciarAcessos: req.contextoGerencial.podeGerenciarAcessos
    });
  } catch (error) {
    console.error('[gerencialController.getPerfil] Erro ao consultar grupamentos.');
    return res.status(500).json({ error: 'Não foi possível carregar o perfil gerencial.' });
  }
};

exports.getUsuariosAcesso = async (req, res) => {
  const administrador = req.contextoGerencial.niveisAcesso.includes(1);
  const niveisPermitidos = administrador ? [1, 2, 3, 5, 7] : [2, 3, 5];

  try {
    const [usuarios] = await pool.query(
      `SELECT f.matricula, f.nome, COALESCE(g.nome, '') AS grupo, f.tipo_atend,
              l.id AS login_id, l.nivel,
              COALESCE(NULLIF(na.tipo, ''), 'Sem nível atribuído') AS nivel_nome
       FROM funcionario f
       LEFT JOIN login_SQD l ON l.id = (
         SELECT MIN(l2.id)
         FROM login_SQD l2
         WHERE UPPER(TRIM(l2.usuario)) = UPPER(TRIM(f.matricula))
            OR UPPER(TRIM(COALESCE(l2.id_func, ''))) = UPPER(TRIM(f.matricula))
       )
       LEFT JOIN grupo g ON g.id = f.id_grupo
       LEFT JOIN nivel_acesso na ON na.nivel_id = l.nivel
       WHERE UPPER(TRIM(f.status)) = 'YES'
       ORDER BY f.nome, f.matricula`
    );
    const idsNiveis = [1, 2, 3, 5, 7];
    const [niveis] = await pool.query(
      `SELECT nivel_id AS nivel, tipo
       FROM nivel_acesso
       WHERE nivel_id IN (${idsNiveis.map(() => '?').join(', ')})
       ORDER BY nivel_id`,
      idsNiveis
    );

    res.set('Cache-Control', 'private, no-store');
    return res.json({
      usuarios: usuarios.map(usuario => {
        const tipoAtendimento = String(usuario.tipo_atend || '').trim();
        const nivel = usuario.nivel == null ? null : Number(usuario.nivel);
        const contextoUsuario = authMiddleware.resolverContextoGerencial(
          { matricula: usuario.matricula, nome: usuario.nome, tipo_atend: tipoAtendimento },
          usuario.login_id === null ? [] : [{ nivel, tipo: usuario.nivel_nome }]
        );
        const gestor = GESTORES
          .filter(item => normalizarNome(item.nome) === normalizarNome(usuario.nome))
          .sort((a, b) => ['GERENTE', 'COORDENADOR', 'SUPERVISOR'].indexOf(a.perfil) -
            ['GERENTE', 'COORDENADOR', 'SUPERVISOR'].indexOf(b.perfil))[0];
        let perfil = gestor?.perfil || contextoUsuario.perfilEfetivo;
        if (perfil === 'ANALISTA') {
          perfil = /^N2(?:_|$)/i.test(tipoAtendimento) ? 'ANALISTA_N2' : 'ANALISTA_N1';
        } else if (!['ADMINISTRADOR', 'GERENTE', 'COORDENADOR', 'SUPERVISOR', 'LIDER'].includes(perfil)) {
          perfil = 'OUTROS';
        }

        return {
          matricula: usuario.matricula,
          nome: usuario.nome,
          grupo: usuario.grupo,
          tipoAtendimento,
          perfil,
          loginAtivo: usuario.login_id !== null,
          nivel,
          nivelNome: usuario.nivel_nome,
          podeAlterar: usuario.login_id !== null && (administrador || nivel !== 1)
        };
      }),
      niveis: [
        { nivel: 0, tipo: 'Sem nível atribuído' },
        ...niveis
          .filter(item => niveisPermitidos.includes(Number(item.nivel)))
          .map(item => ({ nivel: Number(item.nivel), tipo: item.tipo }))
      ],
      administrador
    });
  } catch (error) {
    console.error('[gerencialController.getUsuariosAcesso] Erro ao consultar usuários ativos.');
    return res.status(500).json({ error: 'Não foi possível carregar os usuários ativos.' });
  }
};

exports.alterarNivelAcesso = async (req, res) => {
  const matricula = String(req.params.matricula || '').trim();
  const valorNivel = req.body?.nivel;
  const nivel = typeof valorNivel === 'number' ||
    (typeof valorNivel === 'string' && valorNivel.trim() !== '')
    ? Number(valorNivel)
    : Number.NaN;
  const administrador = req.contextoGerencial.niveisAcesso.includes(1);
  const niveisPermitidos = administrador ? [0, 1, 2, 3, 5, 7] : [0, 2, 3, 5];

  if (!matricula || matricula.length > 15 || !Number.isInteger(nivel)) {
    return res.status(400).json({ error: 'Matrícula ou nível inválido.' });
  }
  if (!niveisPermitidos.includes(nivel)) {
    return res.status(403).json({ error: 'Você não pode atribuir esse nível.' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [usuarios] = await connection.query(
      `SELECT l.id, l.nivel
       FROM funcionario f
       INNER JOIN login_SQD l ON (
         UPPER(TRIM(l.usuario)) = UPPER(TRIM(f.matricula))
         OR UPPER(TRIM(COALESCE(l.id_func, ''))) = UPPER(TRIM(f.matricula))
       )
       WHERE UPPER(TRIM(f.matricula)) = UPPER(TRIM(?))
         AND UPPER(TRIM(f.status)) = 'YES'
       FOR UPDATE`,
      [matricula]
    );

    if (!usuarios.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Usuário ativo com login não encontrado.' });
    }
    if (!administrador && usuarios.some(usuario => Number(usuario.nivel) === 1)) {
      await connection.rollback();
      return res.status(403).json({ error: 'Gerentes não podem alterar contas de administrador.' });
    }

    const ids = usuarios.map(usuario => usuario.id);
    await connection.query(
      `UPDATE login_SQD SET nivel = ? WHERE id IN (${ids.map(() => '?').join(', ')})`,
      [nivel, ...ids]
    );
    await connection.commit();
    console.info(JSON.stringify({
      evento: 'alteracao_nivel_acesso',
      ator: req.user.matricula,
      perfil: req.contextoGerencial.perfilEfetivo,
      alvo: matricula,
      niveisAnteriores: [...new Set(usuarios.map(usuario => Number(usuario.nivel)))],
      nivelNovo: nivel,
      dataHora: new Date().toISOString()
    }));
    res.set('Cache-Control', 'private, no-store');
    return res.json({ matricula, nivel, alterado: true });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('[gerencialController.alterarNivelAcesso] Erro ao alterar nível.');
    return res.status(500).json({ error: 'Não foi possível alterar o nível de acesso.' });
  } finally {
    if (connection) connection.release();
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const filtros = gerencialService.validarFiltros(req.query, req.contextoGerencial);
    const dashboard = await gerencialService.consultarDashboard(req.contextoGerencial, filtros);
    res.set('Cache-Control', 'private, no-store');
    return res.json(dashboard);
  } catch (error) {
    if (error instanceof gerencialService.ErroValidacaoGerencial) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[gerencialController.getDashboard] Erro ao consultar indicadores.');
    return res.status(500).json({ error: 'Não foi possível consultar a visão gerencial.' });
  }
};

exports.getHistoricoAnalista = async (req, res) => {
  try {
    const matricula = String(req.params.matricula || '').trim();
    if (!matricula || matricula.length > 20) {
      return res.status(400).json({ error: 'Matrícula de analista inválida.' });
    }

    const [rows] = await pool.query(
      `SELECT f.matricula, f.nome, f.tipo_atend, f.id_grupo, g.nome AS grupo
       FROM funcionario f
       INNER JOIN grupo g ON g.id = f.id_grupo
       WHERE UPPER(TRIM(f.matricula)) = UPPER(TRIM(?))
         AND UPPER(TRIM(f.status)) = 'YES'
         AND f.id_grupo IN (${req.contextoGerencial.idsGrupos.map(() => '?').join(', ')})
         AND (
           UPPER(TRIM(f.tipo_atend)) LIKE 'N1%'
           OR UPPER(TRIM(f.tipo_atend)) LIKE 'N2%'
           OR UPPER(TRIM(f.tipo_atend)) IN ('TEL', 'TELEFONE', 'WEB')
         )
       LIMIT 1`,
      [matricula, ...req.contextoGerencial.idsGrupos]
    );
    if (!rows.length || rows[0].matricula.toUpperCase() === req.contextoGerencial.idUsuario.toUpperCase()) {
      return res.status(403).json({ error: 'Acesso gerencial não autorizado.' });
    }

    const analista = rows[0];
    const reqHistorico = {
      ...req,
      user: { ...req.user, matricula: analista.matricula },
      query: {}
    };
    res.set('Cache-Control', 'private, no-store');
    return monitoriaController.getHistorico(reqHistorico, res, analista.matricula, analista);
  } catch (error) {
    console.error('[gerencialController.getHistoricoAnalista] Erro ao consultar histórico.');
    return res.status(500).json({ error: 'Não foi possível consultar o histórico do analista.' });
  }
};
