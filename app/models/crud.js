import pool from '../config/db.js';

/**
 * Fabrica de modelos CRUD para las entidades sencillas.
 * Centraliza las consultas parametrizadas (previenen inyeccion SQL) y la
 * actualizacion parcial: solo se modifican las columnas que llegan.
 */
export const crearModelo = ({ tabla, id, columnas, consulta, campoId, prefijo = '', orden }) => {
  const base = consulta || `SELECT * FROM ${tabla}`;
  const idConsulta = campoId || id;
  return {
    columnas,

    async listar(filtros = {}) {
      const condiciones = [];
      const valores = [];
      for (const [campo, valor] of Object.entries(filtros)) {
        if (valor === undefined || valor === '' || valor === null) continue;
        condiciones.push(`${campo.includes('.') ? campo : prefijo + campo} = ?`);
        valores.push(valor);
      }
      const where = condiciones.length ? ` WHERE ${condiciones.join(' AND ')}` : '';
      const [filas] = await pool.query(`${base}${where} ORDER BY ${orden || id}`, valores);
      return filas;
    },

    async obtener(valorId) {
      const [filas] = await pool.query(`${base} WHERE ${idConsulta} = ?`, [valorId]);
      return filas[0];
    },

    async crear(datos, conexion = pool) {
      const [r] = await conexion.query(`INSERT INTO ${tabla} SET ?`, [datos]);
      return r.insertId;
    },

    // Devuelve el numero de filas afectadas: 0 significa que el registro no existe
    async actualizar(valorId, datos, conexion = pool) {
      if (!Object.keys(datos).length) {
        const [f] = await conexion.query(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ${id} = ?`, [valorId]);
        return f[0].n;
      }
      const [r] = await conexion.query(`UPDATE ${tabla} SET ? WHERE ${id} = ?`, [datos, valorId]);
      return r.affectedRows;
    },

    async eliminar(valorId, conexion = pool) {
      const [r] = await conexion.query(`DELETE FROM ${tabla} WHERE ${id} = ?`, [valorId]);
      return r.affectedRows;
    }
  };
};

// Ejecuta una funcion dentro de una transaccion
export const enTransaccion = async (fn) => {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    const resultado = await fn(conexion);
    await conexion.commit();
    return resultado;
  } catch (e) {
    await conexion.rollback();
    throw e;
  } finally {
    conexion.release();
  }
};
