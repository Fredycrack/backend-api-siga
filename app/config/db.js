import mysql from 'mysql2/promise';

// En local usa XAMPP; en produccion (Railway) usa la URL de conexion (DATABASE_URL).
const pool = process.env.DATABASE_URL
  ? mysql.createPool(process.env.DATABASE_URL)
  : mysql.createPool({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'siga_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

export default pool;