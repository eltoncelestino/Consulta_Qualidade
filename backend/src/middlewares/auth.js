const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET precisa estar configurado no arquivo .env.');
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Acesso não autorizado. Token ausente ou inválido.'
    });
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
    return res.status(401).json({
      error: 'Sessão expirada ou token inválido. Faça login novamente.'
    });
  }
}

module.exports = authMiddleware;
