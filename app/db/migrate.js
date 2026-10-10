import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';

/**
 * Migracion automatica: crea las tablas que falten (schema.sql) y, si la base
 * no tiene clientes, carga los datos de demostracion (seed.sql).
 * Permite desplegar la version 2.0 sobre la base de la version 1.0 sin
 * ejecutar scripts a mano: las sentencias son CREATE TABLE IF NOT EXISTS.
 */
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'database');

// Divide un script en sentencias y descarta CREATE DATABASE / USE,
// porque la base ya viene indicada en la conexion.
export const sentencias = (sql) => sql
  .split('\n')
  .filter((linea) => !linea.trim().startsWith('--'))
  .join('\n')
  .split(/;\s*(?:\n|$)/)
  .map((s) => s.trim())
  .filter((s) => s && !/^(CREATE DATABASE|USE)\b/i.test(s));

const ejecutarArchivo = async (conexion, archivo) => {
  const sql = fs.readFileSync(path.join(dir, archivo), 'utf8');
  for (const s of sentencias(sql)) {
    await conexion.query(s);
  }
};

export const migrar = async ({ demo = true } = {}) => {
  const conexion = await pool.getConnection();
  try {
    await ejecutarArchivo(conexion, 'schema.sql');
    // Columnas agregadas despues de la primera publicacion de la version 2.0
    const [cols] = await conexion.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'labor' AND COLUMN_NAME = 'id_factura'"
    );
    if (!cols.length) await conexion.query('ALTER TABLE labor ADD COLUMN id_factura INT');

    const [[{ n }]] = await conexion.query('SELECT COUNT(*) AS n FROM cliente');
    if (demo && n === 0) {
      await ejecutarArchivo(conexion, 'seed.sql');
      console.log('[SIGA] Datos de demostracion cargados');
    }
    console.log('[SIGA] Base de datos lista');
  } finally {
    conexion.release();
  }
};
