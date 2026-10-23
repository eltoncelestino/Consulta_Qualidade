const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// Tratamento seguro da senha: se for aspas vazias ou espaços, considera sem senha
let dbPassword = process.env.DB_PASSWORD !== undefined ? String(process.env.DB_PASSWORD).trim() : '';
if (dbPassword === '""' || dbPassword === "''") {
  dbPassword = '';
}

const pool = mysql.createPool({
  host: (process.env.DB_HOST || 'localhost').trim(),
  port: Number(process.env.DB_PORT) || 3306,
  user: (process.env.DB_USER || 'root').trim(),
  password: dbPassword,
  database: (process.env.DB_NAME || 'quem').trim(),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

pool.getConnection()
  .then((conn) => {
    console.log(`[Database] Conectado com sucesso ao MySQL (${process.env.DB_NAME || 'quem'})`);
    conn.release();
  })
  .catch((err) => {
    console.warn(`[Database] Aviso ao conectar ao MySQL (${err.code || err.message}). Verifique as credenciais no .env`);
  });

module.exports = pool;
