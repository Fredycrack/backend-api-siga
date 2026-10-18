import pool from '../config/db.js';

/**
 * MODELO EMPLEADO
 * Capa de acceso a datos de la entidad EMPLEADO del MER (Sistema SIGA).
 * Centraliza todas las consultas SQL para que los controladores no
 * accedan directamente a la base de datos (separacion de responsabilidades).
 */

// Lista de columnas publicas (se excluye 'password' por seguridad)
const COLUMNAS = `id_empleado, nombre, documento, email, telefono, rol,
                  salario_base, codigo_qr, estado, fecha_ingreso, fecha_registro`;

export const CAMPOS_EDITABLES = ['nombre', 'documento', 'email', 'telefono', 'rol',
  'salario_base', 'codigo_qr', 'estado', 'fecha_ingreso'];

// Obtener todos los empleados, con filtros opcionales por rol y estado
export const obtenerTodos = async ({ rol, estado } = {}) => {
  const condiciones = [];
  const valores = [];
  if (rol) { condiciones.push('rol = ?'); valores.push(rol); }
  if (estado) { condiciones.push('estado = ?'); valores.push(estado); }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const [rows] = await pool.query(`SELECT ${COLUMNAS} FROM empleado ${where} ORDER BY id_empleado`, valores);
  return rows;
};

// Obtener un empleado por su ID
export const obtenerPorId = async (id) => {
  const [rows] = await pool.query(`SELECT ${COLUMNAS} FROM empleado WHERE id_empleado = ?`, [id]);
  return rows[0];
};

// Buscar por codigo QR (registro de asistencia)
export const obtenerPorQR = async (codigo) => {
  const [rows] = await pool.query(`SELECT ${COLUMNAS} FROM empleado WHERE codigo_qr = ?`, [codigo]);
  return rows[0];
};

// Buscar empleado por email (uso interno para autenticacion: si incluye password)
export const buscarPorEmail = async (email) => {
  const [rows] = await pool.query('SELECT * FROM empleado WHERE email = ?', [email]);
  return rows[0];
};

// Contrasena guardada (uso interno)
export const obtenerPassword = async (id) => {
  const [rows] = await pool.query('SELECT password FROM empleado WHERE id_empleado = ?', [id]);
  return rows[0]?.password;
};

// Crear un nuevo empleado; la contrasena llega ya cifrada desde el controlador
export const crear = async (datos) => {
  const [result] = await pool.query('INSERT INTO empleado SET ?', [datos]);
  return result.insertId;
};

// Actualizar solo los campos recibidos (no modifica la contrasena).
// Devuelve las filas afectadas: 0 indica que el empleado no existe.
export const actualizar = async (id, datos) => {
  if (!Object.keys(datos).length) {
    return (await obtenerPorId(id)) ? 1 : 0;
  }
  const [result] = await pool.query('UPDATE empleado SET ? WHERE id_empleado = ?', [datos, id]);
  return result.affectedRows;
};

// Cambiar la contrasena (ya cifrada)
export const actualizarPassword = async (id, hash) => {
  const [result] = await pool.query('UPDATE empleado SET password = ? WHERE id_empleado = ?', [hash, id]);
  return result.affectedRows;
};

// Eliminar un empleado; devuelve las filas afectadas
export const eliminar = async (id) => {
  const [result] = await pool.query('DELETE FROM empleado WHERE id_empleado = ?', [id]);
  return result.affectedRows;
};

// Siguiente codigo QR disponible: QR-EMP-001, QR-EMP-002...
export const siguienteCodigoQR = async () => {
  const [rows] = await pool.query("SELECT codigo_qr FROM empleado WHERE codigo_qr LIKE 'QR-EMP-%'");
  const max = rows.reduce((m, r) => Math.max(m, Number(r.codigo_qr.split('-').pop()) || 0), 0);
  return `QR-EMP-${String(max + 1).padStart(3, '0')}`;
};
