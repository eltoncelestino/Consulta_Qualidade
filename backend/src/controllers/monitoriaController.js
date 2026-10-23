const pool = require('../config/db');
const {
  CRITERIOS_N1_PONTUACAO,
  CRITERIOS_N1_DESCLASSIFICACAO,
  CRITERIOS_N2_PONTUACAO,
  CRITERIOS_N2_DESCLASSIFICACAO
} = require('../config/criterios');

// Cache para saber se a tabela usa a convenção real do newSQM (matricula_analista/data_monitoria)
let colunasMonitorias = null;

async function obterColunasMonitorias() {
  if (colunasMonitorias) return colunasMonitorias;
  try {
    const [cols] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'monitorias'
    `);
    const nomes = cols.map(c => c.COLUMN_NAME);
    colunasMonitorias = {
      matricula: nomes.includes('matricula_analista') ? 'matricula_analista' : 'matricula',
      data: nomes.includes('data_monitoria') ? 'data_monitoria' : 'data',
      nota: nomes.includes('nota_final') ? 'nota_final' : 'nota',
      tma: nomes.includes('tma_dia') ? 'tma_dia' : 'TMA',
      canal: nomes.includes('canal_atendimento') ? 'canal_atendimento' : 'canal',
      demanda: nomes.includes('tipo_ticket') ? 'tipo_ticket' : 'tipo_demanda',
    };
  } catch (e) {
    colunasMonitorias = {
      matricula: 'matricula_analista',
      data: 'data_monitoria',
      nota: 'nota_final',
      tma: 'tma_dia',
      canal: 'canal_atendimento',
      demanda: 'tipo_ticket',
    };
  }
  return colunasMonitorias;
}

// RF06 & RF07 - Cards de Resumo dos últimos 6 meses (180 dias)
exports.getResumo = async (req, res) => {
  const usuarioLogado = req.user.matricula; // Garantia RF02

  try {
    const col = await obterColunasMonitorias();

    const query = `
      SELECT 
        COUNT(m.id) AS total_monitorias,
        ROUND(COALESCE(AVG(m.${col.nota}), 0), 2) AS nota_media,
        COALESCE(SEC_TO_TIME(ROUND(AVG(TIME_TO_SEC(m.${col.tma})))), '00:00:00') AS tma_medio,
        COALESCE(MIN(m.${col.data}), CURDATE()) AS data_inicio_periodo,
        COALESCE(MAX(m.${col.data}), CURDATE()) AS data_fim_periodo
      FROM monitorias m
      WHERE m.${col.matricula} = ?
        AND m.${col.data} >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        AND m.${col.demanda} IS NOT NULL
        AND TRIM(m.${col.demanda}) <> ''
        AND m.ticket IS NOT NULL
        AND TRIM(m.ticket) <> ''
    `;

    const [rows] = await pool.query(query, [usuarioLogado]);
    const resumo = rows[0] || {
      total_monitorias: 0,
      nota_media: 0,
      tma_medio: '00:00:00'
    };

    return res.json({ resumo });
  } catch (error) {
    console.error('[monitoriaController.getResumo] Erro:', error);
    return res.status(500).json({ error: 'Erro ao consultar resumo de monitorias.' });
  }
};

// RF06 & RF08 - Listagem Detalhada dos últimos 6 meses com Pontuações e Desclassificações N1 e N2
exports.getHistorico = async (req, res) => {
  const usuarioLogado = req.user.matricula; // Garantia RF02
  const { busca, canal, tipo_monitoria } = req.query;

  try {
    const col = await obterColunasMonitorias();

    let query = `
      SELECT 
        m.id,
        m.id AS monitoria_id,
        m.ticket,
        m.${col.data} AS data,
        m.${col.nota} AS nota,
        m.${col.demanda} AS tipo_demanda,
        m.tipo_monitoria,
        m.${col.canal} AS canal,
        m.${col.tma} AS TMA
      FROM monitorias m
      WHERE m.${col.matricula} = ?
        AND m.${col.data} >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        AND m.${col.demanda} IS NOT NULL
        AND TRIM(m.${col.demanda}) <> ''
        AND m.ticket IS NOT NULL
        AND TRIM(m.ticket) <> ''
    `;

    const params = [usuarioLogado];

    if (busca) {
      query += ` AND (m.ticket LIKE ? OR m.${col.demanda} LIKE ?)`;
      params.push(`%${busca}%`, `%${busca}%`);
    }

    if (canal) {
      query += ` AND m.${col.canal} = ?`;
      params.push(canal);
    }

    if (tipo_monitoria) {
      query += ` AND m.tipo_monitoria = ?`;
      params.push(tipo_monitoria);
    }

    query += ` ORDER BY m.${col.data} DESC, m.id DESC`;

    const [monitoriasBase] = await pool.query(query, params);

    if (monitoriasBase.length === 0) {
      return res.json({ total: 0, monitorias: [] });
    }

    // Busca detalhada dos critérios para as monitorias encontradas
    const ids = monitoriasBase.map(m => m.id);
    const placeholders = ids.map(() => '?').join(',');

    const nomesTabelasDetalhes = [
      'monitoria_pontuacoes_n1',
      'monitoria_desclassificacoes_n1',
      'monitoria_pontuacoes_n2',
      'monitoria_desclassificacoes_n2',
      'monitoria_pontuacoes_telefone',
      'monitoria_desclassificacoes_telefone',
      'monitoria_pontuacoes_web',
      'monitoria_desclassificacoes_web'
    ];
    const [tabelasDetalhes] = await pool.query(
      `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (${nomesTabelasDetalhes.map(() => '?').join(',')})`,
      nomesTabelasDetalhes
    );
    const tabelasDisponiveis = new Set(tabelasDetalhes.map(tabela => tabela.TABLE_NAME));
    const colunasWeb = new Map();

    if (tabelasDisponiveis.has('monitoria_pontuacoes_web') ||
        tabelasDisponiveis.has('monitoria_desclassificacoes_web')) {
      const [comentarios] = await pool.query(
        `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_COMMENT
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME IN ('monitoria_pontuacoes_web', 'monitoria_desclassificacoes_web')`
      );
      comentarios.forEach(coluna => {
        if (!colunasWeb.has(coluna.TABLE_NAME)) {
          colunasWeb.set(coluna.TABLE_NAME, new Map());
        }
        colunasWeb.get(coluna.TABLE_NAME).set(coluna.COLUMN_NAME, coluna.COLUMN_COMMENT);
      });
    }

    const buscarLinhasDetalhe = async (tabela, colunaId, idsConsulta) => {
      if (!tabelasDisponiveis.has(tabela) || idsConsulta.length === 0) return [];

      const marcadores = idsConsulta.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT * FROM ${tabela} WHERE ${colunaId} IN (${marcadores})`,
        idsConsulta
      );
      return rows;
    };

    // Tabelas normalizadas usadas pelo schema novo.
    const [p1Rows, d1Rows, p2Rows, d2Rows] = await Promise.all([
      buscarLinhasDetalhe('monitoria_pontuacoes_n1', 'monitoria_id', ids),
      buscarLinhasDetalhe('monitoria_desclassificacoes_n1', 'monitoria_id', ids),
      buscarLinhasDetalhe('monitoria_pontuacoes_n2', 'monitoria_id', ids),
      buscarLinhasDetalhe('monitoria_desclassificacoes_n2', 'monitoria_id', ids)
    ]);

    // Dumps do newSQM armazenam N1 de telefone e web em tabelas legadas separadas.
    const idsN1Telefone = monitoriasBase
      .filter(m => m.tipo_monitoria === 'N1_TELEFONE')
      .map(m => m.id);
    const idsN1Web = monitoriasBase
      .filter(m => m.tipo_monitoria === 'N1_WEB')
      .map(m => m.id);
    const [p1TelefoneRows, d1TelefoneRows, p1WebRows, d1WebRows] = await Promise.all([
      buscarLinhasDetalhe('monitoria_pontuacoes_telefone', 'id', idsN1Telefone),
      buscarLinhasDetalhe('monitoria_desclassificacoes_telefone', 'id', idsN1Telefone),
      buscarLinhasDetalhe('monitoria_pontuacoes_web', 'monitoria_id', idsN1Web),
      buscarLinhasDetalhe('monitoria_desclassificacoes_web', 'monitoria_id', idsN1Web)
    ]);

    // Índices em memória por monitoria_id para acesso O(1)
    const mapP1 = new Map();
    const mapD1 = new Map();
    const mapP2 = new Map();
    const mapD2 = new Map();

    // Helper para converter linhas de colunas booleanas (p01..p31 = 1) em descrições legíveis
    const mapearPontuacoesN1 = (row, id) => {
      const itens = [];
      if (row.criterio) {
        itens.push({ criterio: row.criterio, pontos: row.pontos });
      } else {
        Object.keys(row).forEach(campo => {
          if (Number(row[campo]) === 1 && CRITERIOS_N1_PONTUACAO[campo]) {
            const def = CRITERIOS_N1_PONTUACAO[campo];
            itens.push({ criterio: `${def.texto} (${def.grupo})`, pontos: def.pontos });
          }
        });
      }
      mapP1.set(id, itens);
    };

    p1Rows.forEach(row => {
      mapearPontuacoesN1(row, row.monitoria_id);
    });

    p1TelefoneRows.forEach(row => {
      const id = row.id;
      if (!mapP1.has(id)) mapearPontuacoesN1(row, id);
    });

    p1WebRows.forEach(row => {
      const id = row.monitoria_id;
      if (mapP1.has(id)) return;

      const comentarios = colunasWeb.get('monitoria_pontuacoes_web') || new Map();
      const itens = Object.keys(row)
        .filter(campo => campo.startsWith('p') && Number(row[campo]) === 1)
        .map(campo => ({
          criterio: comentarios.get(campo) || campo.replace(/^p\d+_/, '').replace(/_/g, ' ')
        }));
      mapP1.set(id, itens);
    });

    const mapearDesclassificacoesN1 = (row, id) => {
      const itens = [];
      if (row.motivo) {
        itens.push({ motivo: row.motivo });
      } else {
        Object.keys(row).forEach(campo => {
          if (Number(row[campo]) === 1 && CRITERIOS_N1_DESCLASSIFICACAO[campo]) {
            itens.push({ motivo: CRITERIOS_N1_DESCLASSIFICACAO[campo] });
          }
        });
      }
      mapD1.set(id, itens);
    };

    d1Rows.forEach(row => {
      mapearDesclassificacoesN1(row, row.monitoria_id);
    });

    d1TelefoneRows.forEach(row => {
      const id = row.id;
      if (!mapD1.has(id)) mapearDesclassificacoesN1(row, id);
    });

    d1WebRows.forEach(row => {
      const id = row.monitoria_id;
      if (mapD1.has(id)) return;

      const comentarios = colunasWeb.get('monitoria_desclassificacoes_web') || new Map();
      const itens = Object.keys(row)
        .filter(campo => campo.startsWith('d') && Number(row[campo]) === 1)
        .map(campo => ({
          motivo: comentarios.get(campo) || campo.replace(/^d\d+_/, '').replace(/_/g, ' ')
        }));

      if (row.observacao) itens.push({ motivo: row.observacao });
      mapD1.set(id, itens);
    });

    p2Rows.forEach(row => {
      const id = row.monitoria_id;
      const itens = [];
      if (row.criterio) {
        itens.push({ criterio: row.criterio, pontos: row.pontos });
      } else {
        Object.keys(row).forEach(campo => {
          if (Number(row[campo]) === 1 && CRITERIOS_N2_PONTUACAO[campo]) {
            const def = CRITERIOS_N2_PONTUACAO[campo];
            itens.push({ criterio: def.texto, pontos: def.pontos });
          }
        });
      }
      mapP2.set(id, itens);
    });

    d2Rows.forEach(row => {
      const id = row.monitoria_id;
      const itens = [];
      if (row.motivo) {
        itens.push({ motivo: row.motivo });
      } else {
        Object.keys(row).forEach(campo => {
          if (Number(row[campo]) === 1 && CRITERIOS_N2_DESCLASSIFICACAO[campo]) {
            itens.push({ motivo: CRITERIOS_N2_DESCLASSIFICACAO[campo] });
          }
        });
      }
      mapD2.set(id, itens);
    });

    const monitorias = monitoriasBase.map(m => ({
      ...m,
      pontuacoes_n1: mapP1.get(m.id) || [],
      desclassificacoes_n1: mapD1.get(m.id) || [],
      pontuacoes_n2: mapP2.get(m.id) || [],
      desclassificacoes_n2: mapD2.get(m.id) || []
    }));

    return res.json({
      total: monitorias.length,
      monitorias
    });
  } catch (error) {
    console.error('[monitoriaController.getHistorico] Erro:', error);
    return res.status(500).json({ error: 'Erro ao consultar histórico de monitorias.' });
  }
};
