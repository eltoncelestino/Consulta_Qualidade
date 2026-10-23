const runSyncRobot = require('../cron/syncRobot');
const pool = require('../config/db');

(async () => {
  try {
    console.log('--- Executando Sincronização Manual (RF05) ---');
    const result = await runSyncRobot();
    console.log('--- Finalizado ---');
    if (!result.success) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('[SyncRobot] Erro na execução manual:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
