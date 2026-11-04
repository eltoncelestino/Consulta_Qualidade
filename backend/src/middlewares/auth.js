const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const {
  GESTORES,
  GRUPOS_ANALISTAS,
  GRUPOS_POR_TORRE,
  normalizarNome
} = require('../config/gestores');

const JWT_SECRET = process.env.JWT_SECRET;
const GRUPOS_GLOBAIS = [...new Set(Object.values(GRUPOS_POR_TORRE).flat())]
  .filter(id => GRUPOS_ANALISTAS.includes(id));

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET precisa estar configurado no arquivo .env.');
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Autenticação obrigatória.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Injeção obrigatória do usuário logado para garantir RF02
    req.user = {
      matricula: decoded.matricula,
      nome: decoded.nome,
      tipo_atend: decoded.tipo_atend,
      id_grupo: decoded.id_grupo
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Autenticação obrigatória.' });
  }
}

function identificarAnalista(tipoAtend) {
  const tipo = String(tipoAtend || '').trim().toUpperCase();
  return /^N1(?:_|$)/.test(tipo) || /^N2(?:_|$)/.test(tipo) ||
    ['TEL', 'TELEFONE', 'WEB'].includes(tipo);
}

function resolverContextoGerencial(usuario, niveis) {
  const niveisAcesso = [...new Set(niveis.map(item => Number(item.nivel)))];
  const perfilDb = niveis
    .map(item => String(item.tipo || '').trim())
    .find(Boolean) || '';
  const gestor = GESTORES
    .filter(item => normalizarNome(item.nome) === normalizarNome(usuario.nome))
    .sort((a, b) => ['GERENTE', 'COORDENADOR', 'SUPERVISOR'].indexOf(a.perfil) -
      ['GERENTE', 'COORDENADOR', 'SUPERVISOR'].indexOf(b.perfil));
  const gestorPrincipal = gestor[0] || null;
  const nivelAdministrador = niveisAcesso.includes(1);
  const nivel3 = niveisAcesso.includes(3);
  const podeGerenciarAcessos = nivelAdministrador || gestorPrincipal?.perfil === 'GERENTE';
  const temAcesso = nivelAdministrador || nivel3 || gestor.length > 0;
  const perfilEfetivo = nivelAdministrador
    ? 'ADMINISTRADOR'
    : gestorPrincipal
      ? gestorPrincipal.perfil
      : nivel3
        ? 'LIDER'
        : identificarAnalista(usuario.tipo_atend)
          ? 'ANALISTA'
          : normalizarNome(perfilDb);
  const acessoGlobal = nivelAdministrador || gestorPrincipal?.perfil === 'GERENTE';
  const torresGestor = [...new Set(gestor.map(item => item.torre))];
  const idsGestor = torresGestor.flatMap(torre => GRUPOS_POR_TORRE[torre] || []);
  const idsGrupos = temAcesso
    ? (acessoGlobal ? GRUPOS_GLOBAIS : [...new Set(idsGestor)])
    : [];
  const torres = acessoGlobal
    ? [...new Set(Object.keys(GRUPOS_POR_TORRE).filter(torre => torre !== 'OPERAÇÃO COMPLETA'))]
    : torresGestor;

  return {
    idUsuario: usuario.matricula,
    nomeUsuario: usuario.nome,
    perfilEfetivo,
    niveisAcesso,
    torres,
    idsGrupos,
    analista: identificarAnalista(usuario.tipo_atend),
    podeAlternar: temAcesso && identificarAnalista(usuario.tipo_atend),
    podeGerenciarAcessos,
    permitido: temAcesso && idsGrupos.length > 0
  };
}

async function carregarContextoGerencial(matricula) {
  const [usuarios] = await pool.query(
    `SELECT matricula, nome, tipo_atend
     FROM funcionario
     WHERE UPPER(TRIM(matricula)) = UPPER(TRIM(?))
       AND UPPER(TRIM(status)) = 'YES'
     LIMIT 1`,
    [matricula]
  );
  if (!usuarios.length) return null;

  const [niveis] = await pool.query(
    `SELECT DISTINCT l.nivel, na.tipo
     FROM login_SQD l
     LEFT JOIN nivel_acesso na ON na.nivel_id = l.nivel
     WHERE UPPER(TRIM(l.usuario)) = UPPER(TRIM(?))
        OR UPPER(TRIM(COALESCE(l.id_func, ''))) = UPPER(TRIM(?))`,
    [matricula, matricula]
  );
  return resolverContextoGerencial(usuarios[0], niveis);
}

function requireAcessoGerencial(req, res, next) {
  if (!req.user || !req.user.matricula) {
    return res.status(401).json({ error: 'Autenticação obrigatória.' });
  }

  carregarContextoGerencial(req.user.matricula)
    .then(contexto => {
      if (!contexto || !contexto.permitido || contexto.idsGrupos.length === 0) {
        return res.status(403).json({ error: 'Acesso gerencial não autorizado.' });
      }

      req.contextoGerencial = contexto;
      console.info(JSON.stringify({
        evento: 'acesso_visao_gerencial',
        idUsuario: contexto.idUsuario,
        perfilEfetivo: contexto.perfilEfetivo,
        torresConsultadas: contexto.torres,
        grupoConsultado: req.query.grupo_id || null,
        matriculaConsultada: req.params.matricula || null,
        dataHora: new Date().toISOString()
      }));
      return next();
    })
    .catch(error => {
      console.error('[authMiddleware.requireAcessoGerencial] Erro ao resolver contexto.');
      return res.status(500).json({ error: 'Não foi possível validar o acesso gerencial.' });
    });
}

function requireGerenciamentoAcessos(req, res, next) {
  if (!req.contextoGerencial?.podeGerenciarAcessos) {
    return res.status(403).json({ error: 'Acesso não autorizado para gerenciar níveis.' });
  }
  return next();
}

authMiddleware.requireAcessoGerencial = requireAcessoGerencial;
authMiddleware.requireGerenciamentoAcessos = requireGerenciamentoAcessos;
authMiddleware.carregarContextoGerencial = carregarContextoGerencial;
authMiddleware.resolverContextoGerencial = resolverContextoGerencial;
module.exports = authMiddleware;
