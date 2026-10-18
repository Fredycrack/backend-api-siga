import pool from '../config/db.js';

/**
 * Registro de auditoria de las transacciones criticas (RNF07).
 * Nunca interrumpe la operacion principal: si falla, solo se informa en consola.
 */
export const auditar = (req, accion, entidad, idRegistro = null, detalle = null) => {
  const u = req.usuario || {};
  pool.query(
    'INSERT INTO auditoria (id_usuario, tipo_usuario, accion, entidad, id_registro, detalle) VALUES (?, ?, ?, ?, ?, ?)',
    [u.id || null, u.tipo || 'sistema', accion, entidad, idRegistro, detalle ? String(detalle).slice(0, 500) : null]
  ).catch((e) => console.error('[auditoria]', e.message));
};
