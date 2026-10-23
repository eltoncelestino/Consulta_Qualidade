const express = require('express');
const router = express.Router();
const monitoriaController = require('../controllers/monitoriaController');
const authMiddleware = require('../middlewares/auth');

// Todas as rotas de monitoria exigem autenticação obrigatória e aplicam RF02
router.use(authMiddleware);

// RF07: Indicadores e resumo dos últimos 6 meses
router.get('/resumo', monitoriaController.getResumo);

// RF08: Histórico detalhado dos últimos 6 meses
router.get('/historico', monitoriaController.getHistorico);

module.exports = router;
