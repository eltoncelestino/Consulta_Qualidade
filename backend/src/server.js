const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const authRoutes = require('./routes/auth.routes');
const monitoriaRoutes = require('./routes/monitoria.routes');
const runSyncRobot = require('./cron/syncRobot');

const app = express();
const PORT = process.env.PORT || 3002;

// Middlewares globais
app.use(cors());
app.use(express.json());

// Rotas de API
app.use('/api/auth', authRoutes);
app.use('/api/monitorias', monitoriaRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'SQM Qualidade API'
  });
});

// Servir frontend estático a partir de public/
const publicDir = path.join(__dirname, '../public');
app.get('/', (req, res) => {
  res.redirect('/SQD');
});
app.get(['/SQD', '/SQD/'], (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});
app.use(express.static(publicDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Agendamento do Robô de Sincronização (RF05)
const cronSchedule = process.env.SYNC_CRON_SCHEDULE || '*/10 * * * *';
let syncRobotRunning = false;
cron.schedule(cronSchedule, async () => {
  if (syncRobotRunning) {
    console.log('[Cron] Ciclo anterior ainda em execução; ignorando esta ocorrência.');
    return;
  }

  syncRobotRunning = true;
  console.log('[Cron] Executando ciclo automático do robô de sincronização...');
  try {
    await runSyncRobot();
  } finally {
    syncRobotRunning = false;
  }
});

// Inicialização do servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 SQD Backend rodando na porta ${PORT}`);
  console.log(`📡 Healthcheck: http://localhost:${PORT}/api/health`);
  console.log(`⏰ Robô de sincronização agendado com '${cronSchedule}'`);
  console.log(`====================================================`);
});
