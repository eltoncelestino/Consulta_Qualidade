const pool = require('../config/db');

/**
 * RF05 - Robô de Sincronização
 * Identifica funcionários ativos ('status = YES') que ainda não possuem login em `login_SQD`,
 * e insere automaticamente com a senha inicial configurada no ambiente.
 */
async function runSyncRobot() {
  console.log(`[SyncRobot] [${new Date().toISOString()}] Iniciando verificação de novos analistas ativos...`);

  try {
    const defaultPassword = process.env.DEFAULT_USER_PASSWORD;
    if (!defaultPassword) {
      throw new Error('DEFAULT_USER_PASSWORD precisa estar configurado no arquivo .env.');
    }
    const tabelaAlvo = 'login_SQD';

    console.log(`[SyncRobot] Sincronizando com a tabela oficial: '${tabelaAlvo}'`);

    const insertQuery = `
      INSERT INTO ${tabelaAlvo} (id_func, usuario, senha, nivel)
      SELECT 
        f.matricula AS id_func,
        f.matricula AS usuario,
        ? AS senha,
        1 AS nivel
      FROM funcionario f
      LEFT JOIN ${tabelaAlvo} l ON (
        UPPER(TRIM(l.usuario)) = UPPER(TRIM(f.matricula))
        OR UPPER(TRIM(COALESCE(l.id_func, ''))) = UPPER(TRIM(f.matricula))
      )
      WHERE UPPER(TRIM(f.status)) = 'YES'
        AND l.usuario IS NULL
    `;

    const [insertResult] = await pool.query(insertQuery, [defaultPassword]);

    if (insertResult.affectedRows > 0) {
      console.log(`[SyncRobot] ✅ ${insertResult.affectedRows} novo(s) analista(s) ativo(s) sincronizado(s) em '${tabelaAlvo}'.`);
    } else {
      console.log(`[SyncRobot] Nenhum novo analista pendente em '${tabelaAlvo}'.`);
    }

    return {
      success: true,
      tabelaAlvo,
      novosUsuarios: insertResult.affectedRows
    };
  } catch (error) {
    console.error('[SyncRobot] ❌ Erro na sincronização:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = runSyncRobot;
