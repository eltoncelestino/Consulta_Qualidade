const express = require('express');
const router = express.Router();
const gerencialController = require('../controllers/gerencialController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware, authMiddleware.requireAcessoGerencial);

router.get('/perfil', gerencialController.getPerfil);
router.get('/dashboard', gerencialController.getDashboard);
router.get('/analistas/:matricula/historico', gerencialController.getHistoricoAnalista);
router.get('/acessos/usuarios', authMiddleware.requireGerenciamentoAcessos, gerencialController.getUsuariosAcesso);
router.put('/acessos/usuarios/:matricula/nivel', authMiddleware.requireGerenciamentoAcessos, gerencialController.alterarNivelAcesso);

module.exports = router;
