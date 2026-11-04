const pool = require('../config/db');
const {
  GRUPOS_ANALISTAS,
  GRUPOS_POR_TORRE
} = require('../config/gestores');

const UM_DIA_MS = 24 * 60 * 60 * 1000;
const MAX_INTERVALO_DIAS = 366;
const TAMANHO_PAGINA_MAX = 100;
const PAGINA_MAX = 10000;

class ErroValidacaoGerencial extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.name = 'ErroValidacaoGerencial';
    this.status = status;
  }
}

function dataIsoValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ''))) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

function obterPeriodoPadraoGerencial(dataReferencia = new Date()) {
  const referencia = new Date(dataReferencia.getTime());
  const mesAnterior = new Date(Date.UTC(
    referencia.getUTCFullYear(),
    referencia.getUTCMonth() - 1,
    1
  ));
  const ano = mesAnterior.getUTCFullYear();
  const mes = String(mesAnterior.getUTCMonth() + 1).padStart(2, '0');
  const trimestre = `${ano}-Q${Math.floor(mesAnterior.getUTCMonth() / 3) + 1}`;

  return {
    ano,
    mes,
    trimestre,
    periodo: `${ano}-${mes}`
  };
}

function montarPeriodo(query, hoje = new Date()) {
  const modo = String(query.modo || 'mes');
  let inicio;
  let fim;

  if (modo === 'mes') {
    const periodo = String(query.periodo || `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodo);
    if (!match) throw new ErroValidacaoGerencial('Período mensal inválido.');
    inicio = `${match[1]}-${match[2]}-01`;
    fim = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).toISOString().slice(0, 10);
  } else if (modo === 'trimestre') {
    const periodo = String(query.periodo || `${hoje.getFullYear()}-Q${Math.floor(hoje.getMonth() / 3) + 1}`);
    const match = /^(\d{4})-Q([1-4])$/.exec(periodo);
    if (!match) throw new ErroValidacaoGerencial('Período trimestral inválido.');
    const ano = Number(match[1]);
    const mesInicial = (Number(match[2]) - 1) * 3;
    inicio = new Date(Date.UTC(ano, mesInicial, 1)).toISOString().slice(0, 10);
    fim = new Date(Date.UTC(ano, mesInicial + 3, 0)).toISOString().slice(0, 10);
  } else if (modo === 'intervalo') {
    inicio = String(query.inicio || '');
    fim = String(query.fim || '');
    if (!dataIsoValida(inicio) || !dataIsoValida(fim)) {
      throw new ErroValidacaoGerencial('Informe datas válidas no formato AAAA-MM-DD.');
    }
  } else {
    throw new ErroValidacaoGerencial('Modo de período inválido.');
  }

  const dias = Math.floor((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / UM_DIA_MS) + 1;
  if (dias < 1) throw new ErroValidacaoGerencial('A data inicial deve ser anterior ou igual à data final.');
  if (dias > MAX_INTERVALO_DIAS) {
    throw new ErroValidacaoGerencial(`O intervalo não pode exceder ${MAX_INTERVALO_DIAS} dias.`);
  }

  const fimAnterior = new Date(Date.parse(`${inicio}T00:00:00Z`) - UM_DIA_MS).toISOString().slice(0, 10);
  const inicioAnterior = new Date(Date.parse(`${fimAnterior}T00:00:00Z`) - (dias - 1) * UM_DIA_MS)
    .toISOString()
    .slice(0, 10);

  return { modo, inicio, fim, inicioAnterior, fimAnterior };
}

function validarFiltros(query, contexto, hoje) {
  const periodo = montarPeriodo(query, hoje);
  const gruposPermitidos = contexto.idsGrupos;
  let grupoId = null;

  if (query.grupo_id !== undefined && query.grupo_id !== '') {
    grupoId = Number(query.grupo_id);
    if (!Number.isInteger(grupoId) || !GRUPOS_ANALISTAS.includes(grupoId)) {
      throw new ErroValidacaoGerencial('Grupamento inválido.');
    }
    if (!gruposPermitidos.includes(grupoId)) {
      throw new ErroValidacaoGerencial('Acesso gerencial não autorizado.', 403);
    }
  }

  const pagina = query.pagina === undefined ? 1 : Number(query.pagina);
  const tamanhoPagina = query.tamanho === undefined ? 10 : Number(query.tamanho);
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > PAGINA_MAX) {
    throw new ErroValidacaoGerencial('Número de página inválido.');
  }
  if (!Number.isInteger(tamanhoPagina) || tamanhoPagina < 1 || tamanhoPagina > TAMANHO_PAGINA_MAX) {
    throw new ErroValidacaoGerencial(`O tamanho da página deve estar entre 1 e ${TAMANHO_PAGINA_MAX}.`);
  }

  const ordenacao = String(query.ordenacao || 'nota');
  const direcao = String(query.direcao || 'desc').toLowerCase();
  if (!['nome', 'nota', 'avaliacoes'].includes(ordenacao)) {
    throw new ErroValidacaoGerencial('Ordenação inválida.');
  }
  if (!['asc', 'desc'].includes(direcao)) {
    throw new ErroValidacaoGerencial('Direção da ordenação inválida.');
  }

  const busca = String(query.busca || '').trim();
  if (busca.length > 100) throw new ErroValidacaoGerencial('A busca deve ter até 100 caracteres.');

  return {
    ...periodo,
    grupoId,
    pagina,
    tamanhoPagina,
    ordenacao,
    direcao: direcao.toUpperCase(),
    busca,
    grupos: grupoId ? [grupoId] : gruposPermitidos
  };
}

function placeholders(valores) {
  return valores.map(() => '?').join(', ');
}

function condicaoAnalista(alias = 'f') {
  return `UPPER(TRIM(${alias}.status)) = 'YES'
    AND (
      UPPER(TRIM(${alias}.tipo_atend)) LIKE 'N1%'
      OR UPPER(TRIM(${alias}.tipo_atend)) LIKE 'N2%'
      OR UPPER(TRIM(${alias}.tipo_atend)) IN ('TEL', 'TELEFONE', 'WEB')
    )`;
}

function consultarEquipe(contexto, filtros) {
  const grupos = filtros.grupos;
  return {
    sql: `(SELECT
        UPPER(TRIM(f.matricula)) AS matricula_normalizada,
        MIN(f.matricula) AS matricula,
        MAX(f.nome) AS nome,
        MAX(f.id_grupo) AS id_grupo
      FROM funcionario f
      WHERE ${condicaoAnalista('f')}
        AND f.id_grupo IN (${placeholders(grupos)})
        AND UPPER(TRIM(f.matricula)) <> UPPER(TRIM(?))
      GROUP BY UPPER(TRIM(f.matricula)))`,
    params: [...grupos, contexto.idUsuario]
  };
}

async function consultarGrupos(contexto) {
  const ids = [...new Set(contexto.idsGrupos)].filter(id => GRUPOS_ANALISTAS.includes(id));
  if (!ids.length) return [];
  const [rows] = await pool.query(
    `SELECT id, nome FROM grupo WHERE id IN (${placeholders(ids)}) ORDER BY nome`,
    ids
  );
  return rows;
}

async function consultarDashboard(contexto, filtros) {
  const equipe = consultarEquipe(contexto, filtros);
  const formatoEvolucao = filtros.modo === 'mes' ? '%Y-%m-%d' : '%Y-%m';
  const filtroBusca = filtros.busca
    ? 'WHERE (f.nome LIKE ? OR f.matricula LIKE ?)'
    : '';
  const buscaParams = filtros.busca
    ? [`%${filtros.busca}%`, `%${filtros.busca}%`]
    : [];
  const sqlResumo = `
    SELECT
      COUNT(DISTINCT f.matricula_normalizada) AS total_analistas,
      COUNT(m.id) AS total_avaliacoes,
      ROUND(AVG(m.nota_final), 2) AS nota_media,
      ROUND(MIN(m.nota_final), 2) AS menor_nota,
      ROUND(MAX(m.nota_final), 2) AS maior_nota
    FROM ${equipe.sql} f
    LEFT JOIN monitorias m
      ON UPPER(TRIM(m.matricula_analista)) = f.matricula_normalizada
      AND m.data_monitoria BETWEEN ? AND ?
      AND m.ticket IS NOT NULL AND TRIM(m.ticket) <> ''`;
  const sqlAnterior = `
    SELECT ROUND(AVG(m.nota_final), 2) AS nota_media_anterior
    FROM monitorias m
    INNER JOIN ${equipe.sql} f
      ON UPPER(TRIM(m.matricula_analista)) = f.matricula_normalizada
    WHERE m.data_monitoria BETWEEN ? AND ?
      AND m.ticket IS NOT NULL AND TRIM(m.ticket) <> ''`;
  const sqlEvolucao = `
    SELECT DATE_FORMAT(m.data_monitoria, '${formatoEvolucao}') AS periodo,
           ROUND(AVG(m.nota_final), 2) AS nota_media,
           COUNT(m.id) AS total_avaliacoes
    FROM monitorias m
    INNER JOIN ${equipe.sql} f
      ON UPPER(TRIM(m.matricula_analista)) = f.matricula_normalizada
    WHERE m.data_monitoria BETWEEN ? AND ?
      AND m.ticket IS NOT NULL AND TRIM(m.ticket) <> ''
    GROUP BY DATE_FORMAT(m.data_monitoria, '${formatoEvolucao}')
    ORDER BY periodo`;

  const [resumoRows] = await pool.query(sqlResumo, [
    ...equipe.params,
    filtros.inicio,
    filtros.fim
  ]);
  const [anteriorRows] = await pool.query(sqlAnterior, [
    ...equipe.params,
    filtros.inicioAnterior,
    filtros.fimAnterior
  ]);
  const [evolucao] = await pool.query(sqlEvolucao, [
    ...equipe.params,
    filtros.inicio,
    filtros.fim
  ]);

  const [comparativo] = await pool.query(
    `SELECT f.matricula, f.nome, g.nome AS grupo,
            ROUND(atual.nota_media, 2) AS nota_media,
            COALESCE(atual.total_avaliacoes, 0) AS total_avaliacoes
     FROM ${equipe.sql} f
     INNER JOIN grupo g ON g.id = f.id_grupo
     LEFT JOIN (
       SELECT UPPER(TRIM(matricula_analista)) AS matricula_analista,
              AVG(nota_final) AS nota_media,
              COUNT(id) AS total_avaliacoes
       FROM monitorias
       WHERE data_monitoria BETWEEN ? AND ? AND ticket IS NOT NULL AND TRIM(ticket) <> ''
       GROUP BY UPPER(TRIM(matricula_analista))
     ) atual ON atual.matricula_analista = f.matricula_normalizada
     ORDER BY atual.nota_media DESC, f.matricula ASC`,
    [...equipe.params, filtros.inicio, filtros.fim]
  );

  const orderBy = {
    nome: 'f.nome',
    nota: 'nota_media',
    avaliacoes: 'total_avaliacoes'
  }[filtros.ordenacao];
  const offset = (filtros.pagina - 1) * filtros.tamanhoPagina;
  const [analistas] = await pool.query(
    `SELECT f.matricula, f.nome, f.id_grupo, g.nome AS grupo,
            atual.nota_media, COALESCE(atual.total_avaliacoes, 0) AS total_avaliacoes,
            anterior.nota_media AS nota_media_anterior,
            CASE
              WHEN atual.nota_media IS NULL OR anterior.nota_media IS NULL THEN '='
              WHEN atual.nota_media > anterior.nota_media THEN '↑'
              WHEN atual.nota_media < anterior.nota_media THEN '↓'
              ELSE '='
            END AS tendencia
     FROM ${equipe.sql} f
     INNER JOIN grupo g ON g.id = f.id_grupo
     LEFT JOIN (
       SELECT UPPER(TRIM(matricula_analista)) AS matricula_analista,
              ROUND(AVG(nota_final), 2) AS nota_media,
              COUNT(id) AS total_avaliacoes
       FROM monitorias
       WHERE data_monitoria BETWEEN ? AND ? AND ticket IS NOT NULL AND TRIM(ticket) <> ''
       GROUP BY UPPER(TRIM(matricula_analista))
     ) atual ON atual.matricula_analista = f.matricula_normalizada
     LEFT JOIN (
       SELECT UPPER(TRIM(matricula_analista)) AS matricula_analista,
              ROUND(AVG(nota_final), 2) AS nota_media
       FROM monitorias
       WHERE data_monitoria BETWEEN ? AND ? AND ticket IS NOT NULL AND TRIM(ticket) <> ''
       GROUP BY UPPER(TRIM(matricula_analista))
     ) anterior ON anterior.matricula_analista = f.matricula_normalizada
     ${filtroBusca}
     ORDER BY ${orderBy} ${filtros.direcao}, f.matricula ASC
     LIMIT ? OFFSET ?`,
    [
      ...equipe.params,
      filtros.inicio,
      filtros.fim,
      filtros.inicioAnterior,
      filtros.fimAnterior,
      ...buscaParams,
      filtros.tamanhoPagina,
      offset
    ]
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(DISTINCT f.matricula_normalizada) AS total
     FROM ${equipe.sql} f ${filtroBusca}`,
    [...equipe.params, ...buscaParams]
  );

  const resumo = resumoRows[0] || {};
  const anterior = anteriorRows[0] || {};
  const mediaAtual = resumo.nota_media == null ? null : Number(resumo.nota_media);
  const mediaAnterior = anterior.nota_media_anterior == null
    ? null
    : Number(anterior.nota_media_anterior);

  return {
    filtros: {
      modo: filtros.modo,
      inicio: filtros.inicio,
      fim: filtros.fim,
      grupo_id: filtros.grupoId,
      pagina: filtros.pagina,
      tamanho: filtros.tamanhoPagina,
      ordenacao: filtros.ordenacao,
      direcao: filtros.direcao.toLowerCase()
    },
    resumo: {
      total_analistas: Number(resumo.total_analistas || 0),
      total_avaliacoes: Number(resumo.total_avaliacoes || 0),
      nota_media: mediaAtual,
      menor_nota: resumo.menor_nota == null ? null : Number(resumo.menor_nota),
      maior_nota: resumo.maior_nota == null ? null : Number(resumo.maior_nota),
      variacao_periodo_anterior: mediaAtual === null || mediaAnterior === null
        ? null
        : Number((mediaAtual - mediaAnterior).toFixed(2)),
      nota_media_periodo_anterior: mediaAnterior
    },
    evolucao,
    comparativo: comparativo.map(analista => ({
      matricula: analista.matricula,
      nome: analista.nome,
      grupo: analista.grupo,
      nota_media: analista.nota_media == null ? null : Number(analista.nota_media),
      total_avaliacoes: Number(analista.total_avaliacoes || 0),
      tendencia: analista.tendencia
    })),
    analistas,
    paginacao: {
      pagina: filtros.pagina,
      tamanho: filtros.tamanhoPagina,
      total: Number(countRows[0].total || 0),
      paginas: Math.ceil(Number(countRows[0].total || 0) / filtros.tamanhoPagina)
    }
  };
}

module.exports = {
  ErroValidacaoGerencial,
  consultarDashboard,
  consultarGrupos,
  montarPeriodo,
  obterPeriodoPadraoGerencial,
  validarFiltros,
  GRUPOS_POR_TORRE
};
