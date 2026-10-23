const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET precisa estar configurado no arquivo .env.');
}
// Tabela Oficial e Isolada de Autenticação
const TABELA_LOGIN = 'login_SQD';

function verificarSenha(senhaDigitada, senhaGravada) {
  if (!senhaGravada || !senhaDigitada) return false;

  const digitada = String(senhaDigitada).trim();
  const gravada = String(senhaGravada).trim();

  // 1. Comparação direta texto plano
  if (digitada === gravada) return true;

  // 2. MD5
  const hashMd5 = crypto.createHash('md5').update(digitada).digest('hex');
  if (hashMd5.toLowerCase() === gravada.toLowerCase()) return true;

  // 3. SHA1
  const hashSha1 = crypto.createHash('sha1').update(digitada).digest('hex');
  if (hashSha1.toLowerCase() === gravada.toLowerCase()) return true;

  // 4. Bcrypt
  if (gravada.startsWith('$2a$') || gravada.startsWith('$2b$') || gravada.startsWith('$2y$')) {
    try {
      if (bcrypt.compareSync(digitada, gravada)) return true;
    } catch (e) {}
  }

  return false;
}

// RF01 & RF03 - Autenticação Oficial na Tabela login_SQD
exports.login = async (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ error: 'Matrícula e senha são obrigatórios.' });
  }

  const termoBusca = String(usuario).trim();

  try {
    console.log(`[Auth] Tentativa de login para: "${termoBusca}" (Tabela: ${TABELA_LOGIN})`);

    const query = `
      SELECT 
        l.id,
        l.usuario,
        COALESCE(l.id_func, l.usuario) AS id_func,
        l.senha,
        l.nivel,
        f.matricula,
        f.nome,
        f.status,
        f.tipo_atend,
        f.id_grupo
      FROM ${TABELA_LOGIN} l
      LEFT JOIN funcionario f ON (
        UPPER(TRIM(f.matricula)) = UPPER(TRIM(l.usuario)) 
        OR UPPER(TRIM(f.matricula)) = UPPER(TRIM(COALESCE(l.id_func, l.usuario)))
      )
      WHERE UPPER(TRIM(l.usuario)) = UPPER(?)
         OR UPPER(TRIM(COALESCE(l.id_func, ''))) = UPPER(?)
      LIMIT 1
    `;

    const [rows] = await pool.query(query, [termoBusca, termoBusca]);

    if (rows.length === 0) {
      console.warn(`[Auth] ❌ Falha: Matrícula "${termoBusca}" não encontrada em '${TABELA_LOGIN}'.`);
      return res.status(401).json({
        error: `Matrícula "${termoBusca}" não encontrada em '${TABELA_LOGIN}'. Verifique os dados digitados ou execute a sincronização.`
      });
    }

    const user = rows[0];

    // Checagem se o colaborador foi encontrado em 'funcionario'
    if (!user.matricula) {
      console.warn(`[Auth] ❌ Falha: "${termoBusca}" existe em '${TABELA_LOGIN}', mas não está cadastrado em 'funcionario'.`);
      return res.status(401).json({
        error: `A matrícula "${termoBusca}" não possui cadastro correspondente na tabela 'funcionario'.`
      });
    }

    // Checagem de status ativo (RF03) e nível bloqueado (nível 7)
    const statusAtivo = String(user.status || '').toUpperCase().trim();
    if (statusAtivo !== 'YES') {
      console.warn(`[Auth] ❌ Falha: "${termoBusca}" está inativo na tabela 'funcionario' (status = '${user.status}').`);
      return res.status(401).json({
        error: `Acesso negado: o colaborador consta como inativo no sistema (status: ${user.status || 'NÃO DEFINIDO'}).`
      });
    }

    if (user.nivel === 7) {
      console.warn(`[Auth] ❌ Falha: "${termoBusca}" possui nível de acesso 7 (bloqueado).`);
      return res.status(401).json({
        error: 'Acesso negado: usuário com nível de acesso desativado (Nível 7).'
      });
    }

    // Validação de senha
    const senhaValida = verificarSenha(senha, user.senha);

    if (!senhaValida) {
      console.warn(`[Auth] ❌ Falha: Senha incorreta para "${termoBusca}".`);
      return res.status(401).json({
        error: 'Senha incorreta. Caso seja seu primeiro acesso, a senha padrão é 123456.'
      });
    }

    const matriculaOficial = user.matricula;
    const nomeOficial = user.nome || user.usuario;

    const token = jwt.sign(
      {
        matricula: matriculaOficial,
        nome: nomeOficial,
        tipo_atend: user.tipo_atend,
        id_grupo: user.id_grupo
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    console.log(`[Auth] ✅ Sucesso: "${matriculaOficial}" (${nomeOficial}) autenticado com sucesso via '${TABELA_LOGIN}'.`);

    return res.json({
      message: 'Login efetuado com sucesso.',
      token,
      user: {
        matricula: matriculaOficial,
        nome: nomeOficial,
        tipo_atend: user.tipo_atend,
        id_grupo: user.id_grupo
      }
    });
  } catch (error) {
    console.error('[authController.login] Erro no banco de dados:', error);
    return res.status(500).json({
      error: `Erro de comunicação com o banco MySQL: ${error.message}`
    });
  }
};

// RF04 - Alteração de Senha do Usuário Autenticado na Tabela login_SQD
exports.changePassword = async (req, res) => {
  const usuarioLogado = req.user.matricula; // Garantia RF02
  const { senhaAtual, novaSenha } = req.body;

  if (!senhaAtual || !novaSenha) {
    return res.status(400).json({
      error: 'Senha atual e nova senha são obrigatórias.'
    });
  }

  if (novaSenha.length < 6) {
    return res.status(400).json({
      error: 'A nova senha deve possuir no mínimo 6 caracteres.'
    });
  }

  try {
    const [rows] = await pool.query(
      `SELECT senha FROM ${TABELA_LOGIN} 
       WHERE UPPER(TRIM(usuario)) = UPPER(?) 
          OR UPPER(TRIM(COALESCE(id_func, ''))) = UPPER(?) 
       LIMIT 1`,
      [usuarioLogado, usuarioLogado]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: `Usuário não encontrado em ${TABELA_LOGIN}.` });
    }

    const senhaGravada = rows[0].senha;
    if (!verificarSenha(senhaAtual, senhaGravada)) {
      return res.status(400).json({ error: 'A senha atual informada está incorreta.' });
    }

    // Atualiza a senha APENAS em login_SQD (sem alterar a tabela login original)
    await pool.query(
      `UPDATE ${TABELA_LOGIN} 
       SET senha = ? 
       WHERE UPPER(TRIM(usuario)) = UPPER(?) 
          OR UPPER(TRIM(COALESCE(id_func, ''))) = UPPER(?)`,
      [novaSenha, usuarioLogado, usuarioLogado]
    );

    console.log(`[Auth] 🔑 Senha atualizada com sucesso em '${TABELA_LOGIN}' para ${usuarioLogado}`);
    return res.json({ message: 'Senha atualizada com sucesso!' });
  } catch (error) {
    console.error('[authController.changePassword] Erro:', error);
    return res.status(500).json({ error: 'Erro interno ao atualizar senha.' });
  }
};

// Obter dados do usuário logado
exports.me = async (req, res) => {
  const usuarioLogado = req.user.matricula;

  try {
    const [rows] = await pool.query(
      `SELECT matricula, nome, status, tipo_atend, id_analista, id_grupo, sex, date_create
       FROM funcionario 
       WHERE UPPER(TRIM(matricula)) = UPPER(?) 
         AND UPPER(TRIM(status)) = 'YES'
       LIMIT 1`,
      [usuarioLogado]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Colaborador não localizado ou inativo.' });
    }

    return res.json({ user: rows[0] });
  } catch (error) {
    console.error('[authController.me] Erro:', error);
    return res.status(500).json({ error: 'Erro ao buscar perfil do usuário.' });
  }
};
