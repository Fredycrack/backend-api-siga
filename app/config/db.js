import mysql from 'mysql2/promise';

// Pool de conexiones a la base de datos del Sistema SIGA
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'siga_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default pool;
