import pool from '../config/db.js';
import * as Empleado from '../models/empleado.model.js';
import { crearModelo, enTransaccion } from '../models/crud.js';
import { config } from '../config/env.js';
import { asyncHandler, HttpError, requerir, limpiar, fechaValida } from '../utils/http.js';
import { auditar } from '../utils/auditoria.js';

/**
 * CONTROLADOR DEL MODULO DE GESTION DE PERSONAL
 * CU4.1 Registrar asistencia, CU4.2 Asignar tareas, CU4.3 Consultar tareas,
 * CU4.4 Marcar completadas, CU4.5 Calcular nomina, CU4.6 Evaluar productividad.
 */

// ---------- Asistencia (RF19) ----------
const CONSULTA_ASISTENCIA = `
  SELECT a.*, e.nombre, e.rol,
         ROUND(TIMESTAMPDIFF(MINUTE, a.hora_entrada, a.hora_salida) / 60, 2) AS horas
  FROM asistencia a JOIN empleado e ON e.id_empleado = a.id_empleado`;

// Registro con el codigo QR personal: alterna entrada y salida del dia
export const registrarAsistencia = asyncHandler(async (req, res) => {
  requerir(req.body, ['codigo_qr']);
  const empleado = await Empleado.obtenerPorQR(String(req.body.codigo_qr).trim());
  if (!empleado) throw new HttpError(404, 'Codigo QR no registrado');
  if (empleado.estado !== 'Activo') throw new HttpError(403, `${empleado.nombre} esta inactivo`);

  const resultado = await enTransaccion(async (cx) => {
    const [[abierta]] = await cx.query(
      `SELECT id_asistencia, TIMESTAMPDIFF(SECOND, hora_entrada, NOW()) AS segundos
       FROM asistencia WHERE id_empleado = ? AND fecha = CURDATE() AND hora_salida IS NULL
       ORDER BY id_asistencia DESC LIMIT 1 FOR UPDATE`, [empleado.id_empleado]
    );
    if (abierta) {
      if (abierta.segundos < 60) throw new HttpError(409, `${empleado.nombre} ya registro su entrada hace menos de un minuto`);
      await cx.query('UPDATE asistencia SET hora_salida = NOW() WHERE id_asistencia = ?', [abierta.id_asistencia]);
      return { tipo: 'Salida', id_asistencia: abierta.id_asistencia };
    }
    const [r] = await cx.query(
      "INSERT INTO asistencia (id_empleado, fecha, hora_entrada, metodo) VALUES (?, CURDATE(), NOW(), 'QR')", [empleado.id_empleado]
    );
    return { tipo: 'Entrada', id_asistencia: r.insertId };
  });
  const [[fila]] = await pool.query(`${CONSULTA_ASISTENCIA} WHERE a.id_asistencia = ?`, [resultado.id_asistencia]);
  auditar(req, resultado.tipo.toUpperCase(), 'asistencia', resultado.id_asistencia, empleado.nombre);
  res.status(201).json({
    message: `${resultado.tipo} registrada para ${empleado.nombre}`,
    tipo: resultado.tipo,
    empleado: { id_empleado: empleado.id_empleado, nombre: empleado.nombre, rol: empleado.rol },
    registro: fila
  });
});

// Registro manual por el supervisor (olvido del QR)
export const registroManual = asyncHandler(async (req, res) => {
  requerir(req.body, ['id_empleado', 'fecha', 'hora_entrada']);
  fechaValida(req.body.fecha, 'fecha');
  const entrada = `${req.body.fecha} ${req.body.hora_entrada}`;
  const salida = req.body.hora_salida ? `${req.body.fecha} ${req.body.hora_salida}` : null;
  if (salida && salida <= entrada) throw new HttpError(400, 'La hora de salida debe ser posterior a la de entrada');
  const [r] = await pool.query(
    "INSERT INTO asistencia (id_empleado, fecha, hora_entrada, hora_salida, metodo) VALUES (?, ?, ?, ?, 'Manual')",
    [req.body.id_empleado, req.body.fecha, entrada, salida]
  );
  auditar(req, 'MANUAL', 'asistencia', r.insertId);
  res.status(201).json({ id: r.insertId, message: 'Asistencia registrada manualmente' });
});

export const listarAsistencia = asyncHandler(async (req, res) => {
  const cond = [];
  const val = [];
  const { desde, hasta, id_empleado } = req.query;
  if (desde) { cond.push('a.fecha >= ?'); val.push(desde); }
  if (hasta) { cond.push('a.fecha <= ?'); val.push(hasta); }
  if (id_empleado) { cond.push('a.id_empleado = ?'); val.push(id_empleado); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const [filas] = await pool.query(`${CONSULTA_ASISTENCIA} ${where} ORDER BY a.fecha DESC, a.hora_entrada DESC LIMIT 500`, val);
  res.json(filas);
});

export const miAsistencia = asyncHandler(async (req, res) => {
  const [filas] = await pool.query(`${CONSULTA_ASISTENCIA} WHERE a.id_empleado = ? ORDER BY a.fecha DESC LIMIT 60`, [req.usuario.id]);
  res.json(filas);
});

// Presentes hoy
export const asistenciaHoy = asyncHandler(async (req, res) => {
  const [filas] = await pool.query(`${CONSULTA_ASISTENCIA} WHERE a.fecha = CURDATE() ORDER BY a.hora_entrada`);
  res.json(filas);
});

// ---------- Tareas (RF20, RF21) ----------
const Tarea = crearModelo({
  tabla: 'tarea',
  id: 'id_tarea',
  columnas: ['id_empleado', 'titulo', 'descripcion', 'fecha_inicio', 'fecha_limite', 'prioridad', 'estado'],
  consulta: `SELECT t.*, e.nombre AS empleado, s.nombre AS supervisor,
                    (t.estado <> 'Completada' AND t.fecha_limite < CURDATE()) AS vencida
             FROM tarea t JOIN empleado e ON e.id_empleado = t.id_empleado
             LEFT JOIN empleado s ON s.id_empleado = t.id_supervisor`,
  campoId: 't.id_tarea',
  prefijo: 't.',
  orden: "FIELD(t.estado, 'Pendiente', 'En proceso', 'Completada'), t.fecha_limite"
});

const validarFechasTarea = (inicio, limite) => {
  if (inicio) fechaValida(inicio, 'fecha_inicio');
  if (limite) fechaValida(limite, 'fecha_limite');
  if (inicio && limite && limite < inicio) throw new HttpError(400, 'La fecha limite no puede ser anterior a la de inicio');
};

export const listarTareas = asyncHandler(async (req, res) => {
  res.json(await Tarea.listar({ id_empleado: req.query.id_empleado, estado: req.query.estado, prioridad: req.query.prioridad }));
});

export const misTareas = asyncHandler(async (req, res) => {
  res.json(await Tarea.listar({ id_empleado: req.usuario.id }));
});

export const crearTarea = asyncHandler(async (req, res) => {
  requerir(req.body, ['id_empleado', 'titulo', 'fecha_inicio', 'fecha_limite']);
  validarFechasTarea(req.body.fecha_inicio, req.body.fecha_limite);
  const datos = limpiar(req.body, Tarea.columnas);
  datos.id_supervisor = req.usuario.id;
  delete datos.estado;
  const id = await Tarea.crear(datos);
  auditar(req, 'ASIGNAR', 'tarea', id, datos.titulo);
  res.status(201).json({ id, message: 'Tarea asignada correctamente' });
});

export const actualizarTarea = asyncHandler(async (req, res) => {
  const actual = await Tarea.obtener(req.params.id);
  if (!actual) throw new HttpError(404, 'Tarea no encontrada');
  const datos = limpiar(req.body, Tarea.columnas);
  validarFechasTarea(datos.fecha_inicio || actual.fecha_inicio, datos.fecha_limite || actual.fecha_limite);
  await Tarea.actualizar(req.params.id, datos);
  if (datos.estado) {
    await pool.query(
      "UPDATE tarea SET fecha_completada = IF(estado = 'Completada', COALESCE(fecha_completada, NOW()), NULL) WHERE id_tarea = ?",
      [req.params.id]
    );
  }
  auditar(req, 'ACTUALIZAR', 'tarea', req.params.id);
  res.json({ message: 'Tarea actualizada correctamente' });
});

// RF21 - El empleado marca su tarea como en proceso o completada
export const avanceTarea = asyncHandler(async (req, res) => {
  const estado = req.body.estado || 'Completada';
  if (!['En proceso', 'Completada'].includes(estado)) throw new HttpError(400, 'Estado no valido');
  const actual = await Tarea.obtener(req.params.id);
  if (!actual) throw new HttpError(404, 'Tarea no encontrada');
  const esSupervisor = ['Administrador', 'Supervisor'].includes(req.usuario.rol);
  if (!esSupervisor && Number(actual.id_empleado) !== Number(req.usuario.id)) throw new HttpError(403, 'La tarea esta asignada a otro empleado');
  if (actual.estado === 'Completada') throw new HttpError(409, 'La tarea ya esta completada');
  await pool.query(
    "UPDATE tarea SET estado = ?, fecha_completada = IF(? = 'Completada', NOW(), NULL) WHERE id_tarea = ?",
    [estado, estado, req.params.id]
  );
  auditar(req, 'AVANCE', 'tarea', req.params.id, estado);
  res.json({ message: estado === 'Completada' ? 'Tarea completada' : 'Tarea en proceso' });
});

export const eliminarTarea = asyncHandler(async (req, res) => {
  const filas = await Tarea.eliminar(req.params.id);
  if (!filas) throw new HttpError(404, 'Tarea no encontrada');
  auditar(req, 'ELIMINAR', 'tarea', req.params.id);
  res.json({ message: 'Tarea eliminada correctamente' });
});

// ---------- Nomina (RF22) ----------

// Dias laborables de lunes a sabado en el periodo
const diasLaborables = (inicio, fin) => {
  let n = 0;
  for (let d = new Date(`${inicio}T12:00:00`); d <= new Date(`${fin}T12:00:00`); d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0) n++;
  }
  return n;
};

const redondear = (v) => Math.round(v * 100) / 100;

/**
 * Liquidacion del periodo basada en asistencia y productividad:
 *  - devengado = salario base / 30 x dias trabajados (dias con asistencia registrada)
 *  - bonificacion = 1 % del salario por labor finalizada con cumplimiento >= 90 %
 *                   + 0,5 % por tarea completada a tiempo, con tope del 10 %
 *  - deducciones = aportes del trabajador a salud (4 %) y pension (4 %) sobre lo devengado
 * Los porcentajes de bonificacion son parametrizables con variables de entorno.
 */
export const calcularNomina = asyncHandler(async (req, res) => {
  requerir(req.body, ['periodo_inicio', 'periodo_fin']);
  const { periodo_inicio: inicio, periodo_fin: fin } = req.body;
  fechaValida(inicio, 'periodo_inicio');
  fechaValida(fin, 'periodo_fin');
  if (fin < inicio) throw new HttpError(400, 'El fin del periodo no puede ser anterior al inicio');
  const laborables = diasLaborables(inicio, fin);
  const reglas = config.nomina;

  const [empleados] = await pool.query(
    "SELECT id_empleado, nombre, rol, COALESCE(salario_base, 0) AS salario_base FROM empleado WHERE estado = 'Activo' ORDER BY nombre"
  );
  const liquidaciones = await enTransaccion(async (cx) => {
    const lista = [];
    for (const e of empleados) {
      const [[asis]] = await cx.query(
        `SELECT COUNT(DISTINCT fecha) AS dias,
                COALESCE(SUM(TIMESTAMPDIFF(MINUTE, hora_entrada, hora_salida)), 0) / 60 AS horas
         FROM asistencia WHERE id_empleado = ? AND fecha BETWEEN ? AND ?`, [e.id_empleado, inicio, fin]
      );
      const [[lab]] = await cx.query(
        `SELECT COUNT(*) AS n FROM labor WHERE id_empleado = ? AND estado = 'Finalizada'
           AND porcentaje_cumplimiento >= 90 AND DATE(hora_fin) BETWEEN ? AND ?`, [e.id_empleado, inicio, fin]
      );
      const [[tar]] = await cx.query(
        `SELECT COUNT(*) AS n FROM tarea WHERE id_empleado = ? AND estado = 'Completada'
           AND DATE(fecha_completada) BETWEEN ? AND ? AND DATE(fecha_completada) <= fecha_limite`, [e.id_empleado, inicio, fin]
      );
      const salario = Number(e.salario_base);
      const dias = Math.min(Number(asis.dias), laborables);
      const valorDias = redondear((salario / 30) * dias);
      const bonificacion = redondear(Math.min(
        salario * (lab.n * reglas.bonoPorLabor + tar.n * reglas.bonoPorTarea),
        salario * reglas.topeBonificacion
      ));
      const deducciones = redondear((valorDias + bonificacion) * (reglas.aporteSalud + reglas.aportePension));
      const total = redondear(valorDias + bonificacion - deducciones);
      const fila = {
        id_empleado: e.id_empleado, periodo_inicio: inicio, periodo_fin: fin,
        dias_laborables: laborables, dias_trabajados: dias, horas_trabajadas: redondear(Number(asis.horas)),
        salario_base: salario, valor_dias: valorDias, labores_finalizadas: lab.n, tareas_completadas: tar.n,
        bonificacion, deducciones, total
      };
      await cx.query('DELETE FROM nomina WHERE id_empleado = ? AND periodo_inicio = ? AND periodo_fin = ?', [e.id_empleado, inicio, fin]);
      await cx.query('INSERT INTO nomina SET ?', [fila]);
      lista.push({ ...fila, nombre: e.nombre, rol: e.rol });
    }
    return lista;
  });
  auditar(req, 'CALCULAR', 'nomina', null, `${inicio} a ${fin}`);
  const total = redondear(liquidaciones.reduce((s, l) => s + l.total, 0));
  res.status(201).json({ message: `Nomina calculada para ${liquidaciones.length} empleados`, total, liquidaciones });
});

export const listarNomina = asyncHandler(async (req, res) => {
  const cond = [];
  const val = [];
  if (req.query.periodo_inicio) { cond.push('n.periodo_inicio = ?'); val.push(req.query.periodo_inicio); }
  if (req.query.periodo_fin) { cond.push('n.periodo_fin = ?'); val.push(req.query.periodo_fin); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const [filas] = await pool.query(
    `SELECT n.*, e.nombre, e.rol FROM nomina n JOIN empleado e ON e.id_empleado = n.id_empleado ${where}
     ORDER BY n.periodo_inicio DESC, e.nombre`, val
  );
  res.json(filas);
});

export const periodosNomina = asyncHandler(async (req, res) => {
  const [filas] = await pool.query(
    `SELECT periodo_inicio, periodo_fin, COUNT(*) AS empleados, SUM(total) AS total
     FROM nomina GROUP BY periodo_inicio, periodo_fin ORDER BY periodo_inicio DESC`
  );
  res.json(filas);
});

export const miNomina = asyncHandler(async (req, res) => {
  const [filas] = await pool.query('SELECT * FROM nomina WHERE id_empleado = ? ORDER BY periodo_inicio DESC', [req.usuario.id]);
  res.json(filas);
});
