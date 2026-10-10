import mysql from 'mysql2/promise';
import { config } from './env.js';

/**
 * Pool de conexiones a MySQL o TiDB.
 * - Con DATABASE_URL (contenedores y produccion) se usa la cadena de conexion.
 *   Si el servidor es TiDB Cloud se activa TLS automaticamente, porque TiDB
 *   rechaza conexiones sin cifrar. Tambien se puede forzar con DB_SSL=true.
 * - Sin DATABASE_URL se conecta al MySQL local (XAMPP) con DB_HOST, DB_USER, etc.
 * Las fechas se devuelven como texto para evitar corrimientos de zona horaria
 * y los DECIMAL como numeros.
 */
const TLS = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
const comunes = {
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL) || 10,
  queueLimit: 0,
  dateStrings: true,
  decimalNumbers: true
};

let pool;
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  const usarTLS = process.env.DB_SSL === 'true' || url.hostname.endsWith('tidbcloud.com');
  if (usarTLS && !url.searchParams.has('ssl')) url.searchParams.set('ssl', JSON.stringify(TLS));
  for (const [clave, valor] of Object.entries(comunes)) url.searchParams.set(clave, String(valor));
  pool = mysql.createPool(url.toString());
} else {
  pool = mysql.createPool({
    ...comunes,
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'siga_db',
    ...(process.env.DB_SSL === 'true' ? { ssl: TLS } : {})
  });
}

// Cada conexion trabaja en la hora de Colombia (UTC-5), de modo que NOW()
// y CURDATE() coinciden con la hora local aunque el servidor este en UTC.
pool.pool.on('connection', (conexion) => {
  conexion.query(`SET time_zone = '${config.zonaHoraria}'`);
});

export default pool;
