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

// Obtener todos los empleados
export const obtenerTodos = async () => {
  const [rows] = await pool.query(`SELECT ${COLUMNAS} FROM empleado ORDER BY id_empleado`);
  return rows;
};

// Obtener un empleado por su ID
export const obtenerPorId = async (id) => {
  const [rows] = await pool.query(
    `SELECT ${COLUMNAS} FROM empleado WHERE id_empleado = ?`,
    [id]
  );
  return rows[0];
};

// Buscar empleado por email (uso interno para autenticacion: si incluye password)
export const buscarPorEmail = async (email) => {
  const [rows] = await pool.query('SELECT * FROM empleado WHERE email = ?', [email]);
  return rows[0];
};

// Crear un nuevo empleado
export const crear = async (data) => {
  const {
    nombre, documento, email, telefono, password,
    rol, salario_base, codigo_qr, estado, fecha_ingreso
  } = data;

  const [result] = await pool.query(
    `INSERT INTO empleado
      (nombre, documento, email, telefono, password, rol, salario_base, codigo_qr, estado, fecha_ingreso)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nombre, documento, email, telefono || null, password,
      rol, salario_base || null, codigo_qr || null,
      estado || 'Activo', fecha_ingreso || null
    ]
  );
  return result.insertId;
};

// Actualizar un empleado existente (no modifica la contrasena)
export const actualizar = async (id, data) => {
  const {
    nombre, documento, email, telefono,
    rol, salario_base, codigo_qr, estado, fecha_ingreso
  } = data;

  await pool.query(
    `UPDATE empleado SET
       nombre = ?, documento = ?, email = ?, telefono = ?,
       rol = ?, salario_base = ?, codigo_qr = ?, estado = ?, fecha_ingreso = ?
     WHERE id_empleado = ?`,
    [
      nombre, documento, email, telefono || null,
      rol, salario_base || null, codigo_qr || null,
      estado, fecha_ingreso || null, id
    ]
  );
};

// Eliminar un empleado
export const eliminar = async (id) => {
  await pool.query('DELETE FROM empleado WHERE id_empleado = ?', [id]);
};
