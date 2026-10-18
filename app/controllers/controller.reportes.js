import pool from '../config/db.js';
import * as Factura from '../models/factura.model.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import { reportePDF, reporteExcel, pesos } from '../utils/documentos.js';
import { auditar } from '../utils/auditoria.js';

/**
 * CONTROLADOR DEL MODULO DE REPORTES Y ESTADISTICAS
 * CU8.1 Consultar dashboard, CU8.2 Generar reportes, CU8.3 Analizar rentabilidad,
 * CU8.4 Exportar reportes, CU8.5 Consultar productividad, CU8.7 Visualizar indicadores.
 */

const hoy = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const inicioMes = () => `${hoy().slice(0, 7)}-01`;
const rango = (q) => ({ desde: q.desde || `${hoy().slice(0, 4)}-01-01`, hasta: q.hasta || hoy() });
const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;

// RF37 - Tablero con indicadores en tiempo real
export const dashboard = asyncHandler(async (req, res) => {
  const desde = inicioMes();
  const [[labores]] = await pool.query(
    `SELECT COUNT(*) AS total, SUM(estado = 'Finalizada') AS finalizadas, SUM(estado = 'En proceso') AS en_proceso,
            SUM(estado = 'Programada') AS programadas,
            ROUND(AVG(CASE WHEN estado = 'Finalizada' THEN porcentaje_cumplimiento END), 1) AS cumplimiento
     FROM labor WHERE fecha_programada >= ?`, [desde]
  );
  const [equipos] = await pool.query('SELECT estado, COUNT(*) AS total FROM equipo GROUP BY estado');
  const [[facturacion]] = await pool.query(
    "SELECT COALESCE(SUM(total), 0) AS facturado_mes FROM factura WHERE estado <> 'Anulada' AND fecha_emision >= ?", [desde]
  );
  const [[cartera]] = await pool.query(
    `SELECT COALESCE(SUM(saldo), 0) AS pendiente,
            COALESCE(SUM(CASE WHEN fecha_vencimiento < CURDATE() THEN saldo ELSE 0 END), 0) AS vencida
     FROM factura WHERE estado IN ('Pendiente','Pagada parcialmente')`
  );
  const [[recaudo]] = await pool.query('SELECT COALESCE(SUM(valor), 0) AS recaudado_mes FROM pago WHERE fecha_pago >= ?', [desde]);
  const [[inventario]] = await pool.query(
    "SELECT COUNT(*) AS bajo_minimo FROM inventario WHERE estado = 'Activo' AND cantidad_disponible <= cantidad_minima"
  );
  const [[ordenes]] = await pool.query("SELECT COUNT(*) AS pendientes FROM orden_compra WHERE estado = 'Pendiente'");
  const [[sst]] = await pool.query("SELECT COUNT(*) AS abiertos FROM incidente WHERE estado <> 'Cerrado'");
  const [[personal]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM empleado WHERE estado = 'Activo') AS activos,
            (SELECT COUNT(DISTINCT id_empleado) FROM asistencia WHERE fecha = CURDATE()) AS presentes_hoy,
            (SELECT COUNT(*) FROM tarea WHERE estado <> 'Completada' AND fecha_limite < CURDATE()) AS tareas_vencidas`
  );
  const [[solicitudes]] = await pool.query("SELECT COUNT(*) AS pendientes FROM solicitud_servicio WHERE estado = 'Pendiente'");
  const [facturacionMensual] = await pool.query(
    `SELECT DATE_FORMAT(fecha_emision, '%Y-%m') AS mes, SUM(total) AS total
     FROM factura WHERE estado <> 'Anulada' AND fecha_emision >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
     GROUP BY DATE_FORMAT(fecha_emision, '%Y-%m') ORDER BY mes`
  );
  const [laboresMensuales] = await pool.query(
    `SELECT DATE_FORMAT(fecha_programada, '%Y-%m') AS mes, COUNT(*) AS finalizadas
     FROM labor WHERE estado = 'Finalizada' AND fecha_programada >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
     GROUP BY DATE_FORMAT(fecha_programada, '%Y-%m') ORDER BY mes`
  );
  res.json({
    fecha: hoy(),
    labores: { ...labores, finalizadas: Number(labores.finalizadas || 0), en_proceso: Number(labores.en_proceso || 0), programadas: Number(labores.programadas || 0) },
    equipos,
    finanzas: { ...facturacion, ...cartera, ...recaudo },
    inventario: { ...inventario, ordenes_pendientes: ordenes.pendientes },
    sst: { incidentes_abiertos: sst.abiertos },
    personal,
    solicitudes_pendientes: solicitudes.pendientes,
    series: { facturacion: facturacionMensual, labores: laboresMensuales }
  });
});

/**
 * RF38 - Rentabilidad por cliente o por tipo de servicio.
 * ingresos = subtotal facturado (sin IVA) de facturas no anuladas en el periodo
 * costos   = mano de obra de las labores finalizadas (horas x costo por hora del trabajador,
 *            con costo por hora = salario base / 240) + repuestos usados en los equipos
 */
const datosRentabilidad = async ({ desde, hasta }, agrupar) => {
  if (agrupar === 'servicio') {
    const [ingresos] = await pool.query(
      `SELECT COALESCE(s.nombre_servicio, 'Sin servicio asociado') AS grupo, COALESCE(s.tipo_servicio, '-') AS tipo, SUM(d.subtotal) AS ingresos
       FROM detalle_factura d JOIN factura f ON f.id_factura = d.id_factura
       LEFT JOIN servicio s ON s.id_servicio = d.id_servicio
       WHERE f.estado <> 'Anulada' AND f.fecha_emision BETWEEN ? AND ?
       GROUP BY COALESCE(s.nombre_servicio, 'Sin servicio asociado'), COALESCE(s.tipo_servicio, '-')`, [desde, hasta]
    );
    const [costos] = await pool.query(
      `SELECT s.nombre_servicio AS grupo,
              SUM(TIMESTAMPDIFF(MINUTE, l.hora_inicio, l.hora_fin) / 60 * COALESCE(e.salario_base, 0) / 240) AS costos
       FROM labor l JOIN servicio s ON s.id_servicio = l.id_servicio JOIN empleado e ON e.id_empleado = l.id_empleado
       WHERE l.estado = 'Finalizada' AND l.fecha_programada BETWEEN ? AND ?
       GROUP BY s.nombre_servicio`, [desde, hasta]
    );
    const [[rep]] = await pool.query(
      `SELECT COALESCE(SUM(r.cantidad * r.costo_unitario), 0) AS costos FROM repuesto_equipo r
       WHERE DATE(r.fecha) BETWEEN ? AND ?`, [desde, hasta]
    );
    const mapa = new Map();
    ingresos.forEach((i) => mapa.set(i.grupo, { grupo: i.grupo, tipo: i.tipo, ingresos: Number(i.ingresos), costos: 0 }));
    costos.forEach((c) => {
      const f = mapa.get(c.grupo) || { grupo: c.grupo, tipo: 'Agricola', ingresos: 0, costos: 0 };
      f.costos += Number(c.costos);
      mapa.set(c.grupo, f);
    });
    if (Number(rep.costos) > 0) {
      mapa.set('Repuestos de servicios tecnologicos', {
        grupo: 'Repuestos de servicios tecnologicos', tipo: 'Tecnologico', ingresos: 0, costos: Number(rep.costos)
      });
    }
    return [...mapa.values()];
  }
  const [filas] = await pool.query(
    `SELECT c.nombre_cliente AS grupo, c.tipo_cliente AS tipo,
            (SELECT COALESCE(SUM(f.subtotal), 0) FROM factura f WHERE f.id_cliente = c.id_cliente AND f.estado <> 'Anulada'
               AND f.fecha_emision BETWEEN ? AND ?) AS ingresos,
            (SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE, l.hora_inicio, l.hora_fin) / 60 * COALESCE(e.salario_base, 0) / 240), 0)
               FROM labor l JOIN contrato k ON k.id_contrato = l.id_contrato JOIN empleado e ON e.id_empleado = l.id_empleado
               WHERE k.id_cliente = c.id_cliente AND l.estado = 'Finalizada' AND l.fecha_programada BETWEEN ? AND ?)
            + (SELECT COALESCE(SUM(r.cantidad * r.costo_unitario), 0) FROM repuesto_equipo r JOIN equipo q ON q.id_equipo = r.id_equipo
               WHERE q.id_cliente = c.id_cliente AND DATE(r.fecha) BETWEEN ? AND ?) AS costos
     FROM cliente c`, [desde, hasta, desde, hasta, desde, hasta]
  );
  return filas.map((f) => ({ ...f, ingresos: Number(f.ingresos), costos: Number(f.costos) }));
};

const completarRentabilidad = (filas) => filas
  .filter((f) => f.ingresos > 0 || f.costos > 0)
  .map((f) => ({
    ...f, ingresos: r2(f.ingresos), costos: r2(f.costos), utilidad: r2(f.ingresos - f.costos),
    margen: f.ingresos > 0 ? r2(((f.ingresos - f.costos) / f.ingresos) * 100) : null
  }))
  .sort((a, b) => b.utilidad - a.utilidad);

export const rentabilidad = asyncHandler(async (req, res) => {
  const r = rango(req.query);
  const agrupar = req.query.agrupar === 'servicio' ? 'servicio' : 'cliente';
  res.json({ ...r, agrupar, filas: completarRentabilidad(await datosRentabilidad(r, agrupar)) });
});

// RF40 - Productividad individual de los empleados
const datosProductividad = async ({ desde, hasta }) => {
  const [filas] = await pool.query(
    `SELECT e.id_empleado, e.nombre, e.rol,
            (SELECT COUNT(*) FROM labor l WHERE l.id_empleado = e.id_empleado AND l.fecha_programada BETWEEN ? AND ?) AS labores_asignadas,
            (SELECT COUNT(*) FROM labor l WHERE l.id_empleado = e.id_empleado AND l.estado = 'Finalizada' AND l.fecha_programada BETWEEN ? AND ?) AS labores_finalizadas,
            (SELECT ROUND(AVG(l.porcentaje_cumplimiento), 1) FROM labor l WHERE l.id_empleado = e.id_empleado AND l.estado = 'Finalizada' AND l.fecha_programada BETWEEN ? AND ?) AS cumplimiento_promedio,
            (SELECT ROUND(COALESCE(SUM(TIMESTAMPDIFF(MINUTE, l.hora_inicio, l.hora_fin)), 0) / 60, 1) FROM labor l WHERE l.id_empleado = e.id_empleado AND l.estado = 'Finalizada' AND l.fecha_programada BETWEEN ? AND ?) AS horas_labor,
            (SELECT COUNT(*) FROM tarea t WHERE t.id_empleado = e.id_empleado AND t.fecha_limite BETWEEN ? AND ?) AS tareas_asignadas,
            (SELECT COUNT(*) FROM tarea t WHERE t.id_empleado = e.id_empleado AND t.estado = 'Completada' AND t.fecha_limite BETWEEN ? AND ?) AS tareas_completadas,
            (SELECT COUNT(*) FROM tarea t WHERE t.id_empleado = e.id_empleado AND t.estado <> 'Completada' AND t.fecha_limite < CURDATE() AND t.fecha_limite BETWEEN ? AND ?) AS tareas_vencidas,
            (SELECT COUNT(DISTINCT a.fecha) FROM asistencia a WHERE a.id_empleado = e.id_empleado AND a.fecha BETWEEN ? AND ?) AS dias_asistidos
     FROM empleado e WHERE e.estado = 'Activo' ORDER BY e.nombre`,
    Array(8).fill([desde, hasta]).flat()
  );
  return filas.map((f) => ({ ...f, cumplimiento_promedio: f.cumplimiento_promedio === null ? null : Number(f.cumplimiento_promedio) }));
};

export const productividad = asyncHandler(async (req, res) => {
  const r = rango(req.query);
  let filas = await datosProductividad(r);
  if (req.query.rol) filas = filas.filter((f) => f.rol === req.query.rol);
  res.json({ ...r, filas });
});

/**
 * RF32 - Indicadores de SST para la ARL y el Ministerio de Trabajo, con las
 * formulas de la Resolucion 0312 de 2019 (art. 30) calculadas para el periodo:
 *  frecuencia = accidentes / trabajadores x 100
 *  severidad  = dias perdidos por accidentes / trabajadores x 100
 *  mortalidad = accidentes mortales / accidentes x 100
 */
const datosSST = async ({ desde, hasta }) => {
  const [[{ trabajadores }]] = await pool.query("SELECT COUNT(*) AS trabajadores FROM empleado WHERE estado = 'Activo'");
  const [[acc]] = await pool.query(
    `SELECT COUNT(*) AS accidentes, COALESCE(SUM(dias_incapacidad), 0) AS dias_perdidos, SUM(gravedad = 'Mortal') AS mortales,
            SUM(reportado_arl = 1) AS reportados_arl
     FROM incidente WHERE tipo = 'Accidente' AND DATE(fecha_evento) BETWEEN ? AND ?`, [desde, hasta]
  );
  const [[inc]] = await pool.query(
    "SELECT COUNT(*) AS incidentes FROM incidente WHERE tipo = 'Incidente' AND DATE(fecha_evento) BETWEEN ? AND ?", [desde, hasta]
  );
  const [[cap]] = await pool.query(
    `SELECT COUNT(DISTINCT c.id_capacitacion) AS realizadas, COUNT(p.id_participante) AS convocados, COALESCE(SUM(p.asistio), 0) AS asistentes
     FROM capacitacion_sst c LEFT JOIN participante_capacitacion p ON p.id_capacitacion = c.id_capacitacion
     WHERE c.estado = 'Realizada' AND c.fecha_capacitacion BETWEEN ? AND ?`, [desde, hasta]
  );
  const [[epp]] = await pool.query('SELECT COUNT(*) AS entregas, COALESCE(SUM(cantidad), 0) AS elementos FROM entrega_epp WHERE fecha_entrega BETWEEN ? AND ?', [desde, hasta]);
  const [eventos] = await pool.query(
    `SELECT i.tipo, i.fecha_evento, i.lugar, e.nombre AS empleado, i.gravedad, i.dias_incapacidad, i.estado,
            IF(i.reportado_arl = 1, 'Si', 'No') AS reportado_arl, i.descripcion
     FROM incidente i LEFT JOIN empleado e ON e.id_empleado = i.id_empleado
     WHERE DATE(i.fecha_evento) BETWEEN ? AND ? ORDER BY i.fecha_evento`, [desde, hasta]
  );
  const t = Number(trabajadores) || 1;
  const accidentes = Number(acc.accidentes);
  return {
    trabajadores: Number(trabajadores),
    accidentes, incidentes: Number(inc.incidentes), dias_perdidos: Number(acc.dias_perdidos),
    mortales: Number(acc.mortales || 0), reportados_arl: Number(acc.reportados_arl || 0),
    indice_frecuencia: r2((accidentes / t) * 100),
    indice_severidad: r2((Number(acc.dias_perdidos) / t) * 100),
    proporcion_mortalidad: accidentes ? r2((Number(acc.mortales || 0) / accidentes) * 100) : 0,
    capacitaciones_realizadas: Number(cap.realizadas),
    cobertura_capacitacion: Number(cap.convocados) ? r2((Number(cap.asistentes) / Number(cap.convocados)) * 100) : null,
    entregas_epp: Number(epp.entregas), elementos_epp: Number(epp.elementos),
    eventos
  };
};

export const sst = asyncHandler(async (req, res) => {
  const r = rango(req.query);
  res.json({ ...r, ...(await datosSST(r)) });
});

// ---------- Exportacion a Excel y PDF (RF39, RF32) ----------
const REPORTES = {
  rentabilidad: async (q) => {
    const r = rango(q);
    const agrupar = q.agrupar === 'servicio' ? 'servicio' : 'cliente';
    const filas = completarRentabilidad(await datosRentabilidad(r, agrupar));
    const tot = filas.reduce((a, f) => ({ i: a.i + f.ingresos, c: a.c + f.costos }), { i: 0, c: 0 });
    return {
      titulo: `Rentabilidad por ${agrupar}`, subtitulo: `Periodo ${r.desde} a ${r.hasta}`,
      resumen: [['Ingresos', pesos(tot.i)], ['Costos', pesos(tot.c)], ['Utilidad', pesos(tot.i - tot.c)]],
      columnas: [
        { titulo: agrupar === 'servicio' ? 'Servicio' : 'Cliente', campo: 'grupo', ancho: 3 },
        { titulo: 'Tipo', campo: 'tipo', ancho: 1.6 },
        { titulo: 'Ingresos', campo: 'ingresos', ancho: 1.6, alinear: 'right', formato: pesos, numerico: true, moneda: true },
        { titulo: 'Costos', campo: 'costos', ancho: 1.6, alinear: 'right', formato: pesos, numerico: true, moneda: true },
        { titulo: 'Utilidad', campo: 'utilidad', ancho: 1.6, alinear: 'right', formato: pesos, numerico: true, moneda: true },
        { titulo: 'Margen %', campo: 'margen', ancho: 1, alinear: 'right', numerico: true }
      ],
      filas
    };
  },
  productividad: async (q) => {
    const r = rango(q);
    return {
      titulo: 'Productividad de los empleados', subtitulo: `Periodo ${r.desde} a ${r.hasta}`,
      columnas: [
        { titulo: 'Empleado', campo: 'nombre', ancho: 2.4 }, { titulo: 'Rol', campo: 'rol', ancho: 2 },
        { titulo: 'Labores', campo: 'labores_asignadas', ancho: 1, alinear: 'right', numerico: true },
        { titulo: 'Finalizadas', campo: 'labores_finalizadas', ancho: 1, alinear: 'right', numerico: true },
        { titulo: 'Cumplimiento %', campo: 'cumplimiento_promedio', ancho: 1.2, alinear: 'right', numerico: true },
        { titulo: 'Horas', campo: 'horas_labor', ancho: 0.9, alinear: 'right', numerico: true },
        { titulo: 'Tareas', campo: 'tareas_asignadas', ancho: 0.9, alinear: 'right', numerico: true },
        { titulo: 'Completadas', campo: 'tareas_completadas', ancho: 1.1, alinear: 'right', numerico: true },
        { titulo: 'Vencidas', campo: 'tareas_vencidas', ancho: 0.9, alinear: 'right', numerico: true },
        { titulo: 'Dias asistidos', campo: 'dias_asistidos', ancho: 1.1, alinear: 'right', numerico: true }
      ],
      filas: await datosProductividad(r)
    };
  },
  cartera: async () => {
    const filas = await Factura.cartera();
    const tot = filas.reduce((a, f) => ({ s: a.s + Number(f.saldo), v: a.v + Number(f.vencido) }), { s: 0, v: 0 });
    return {
      titulo: 'Estado de cartera', subtitulo: `Corte ${hoy()}`,
      resumen: [['Saldo total', pesos(tot.s)], ['Cartera vencida', pesos(tot.v)]],
      columnas: [
        { titulo: 'Cliente', campo: 'nombre_cliente', ancho: 3 }, { titulo: 'NIT/CC', campo: 'documento', ancho: 1.5 },
        { titulo: 'Facturas', campo: 'facturas', ancho: 0.8, alinear: 'right', numerico: true },
        { titulo: 'Facturado', campo: 'facturado', ancho: 1.6, alinear: 'right', formato: pesos, numerico: true, moneda: true },
        { titulo: 'Pagado', campo: 'pagado', ancho: 1.6, alinear: 'right', formato: pesos, numerico: true, moneda: true },
        { titulo: 'Saldo', campo: 'saldo', ancho: 1.6, alinear: 'right', formato: pesos, numerico: true, moneda: true },
        { titulo: 'Vencido', campo: 'vencido', ancho: 1.6, alinear: 'right', formato: pesos, numerico: true, moneda: true }
      ],
      filas
    };
  },
  inventario: async () => {
    const [filas] = await pool.query(
      `SELECT codigo_producto, nombre_producto, categoria, unidad, cantidad_disponible, cantidad_minima, precio_unitario,
              cantidad_disponible * precio_unitario AS valor, IF(cantidad_disponible <= cantidad_minima, 'Bajo minimo', 'Normal') AS alerta
       FROM inventario WHERE estado = 'Activo' ORDER BY categoria, nombre_producto`
    );
    const total = filas.reduce((s, f) => s + Number(f.valor), 0);
    return {
      titulo: 'Inventario valorizado', subtitulo: `Corte ${hoy()}`, resumen: [['Valor total del inventario', pesos(total)]],
      columnas: [
        { titulo: 'Codigo', campo: 'codigo_producto', ancho: 1 }, { titulo: 'Producto', campo: 'nombre_producto', ancho: 2.8 },
        { titulo: 'Categoria', campo: 'categoria', ancho: 1.6 }, { titulo: 'Unidad', campo: 'unidad', ancho: 0.9 },
        { titulo: 'Existencia', campo: 'cantidad_disponible', ancho: 1, alinear: 'right', numerico: true },
        { titulo: 'Minimo', campo: 'cantidad_minima', ancho: 0.9, alinear: 'right', numerico: true },
        { titulo: 'Valor', campo: 'valor', ancho: 1.4, alinear: 'right', formato: pesos, numerico: true, moneda: true },
        { titulo: 'Alerta', campo: 'alerta', ancho: 1.1 }
      ],
      filas
    };
  },
  sst: async (q) => {
    const r = rango(q);
    const d = await datosSST(r);
    return {
      titulo: 'Informe de seguridad y salud en el trabajo', subtitulo: `Periodo ${r.desde} a ${r.hasta} - Indicadores segun la Resolucion 0312 de 2019`,
      resumen: [
        ['Trabajadores activos', d.trabajadores], ['Accidentes de trabajo', d.accidentes], ['Incidentes', d.incidentes],
        ['Dias perdidos', d.dias_perdidos], ['Frecuencia de accidentalidad', `${d.indice_frecuencia} %`],
        ['Severidad de accidentalidad', `${d.indice_severidad} %`], ['Proporcion de accidentes mortales', `${d.proporcion_mortalidad} %`],
        ['Accidentes reportados a la ARL', d.reportados_arl], ['Capacitaciones realizadas', d.capacitaciones_realizadas],
        ['Cobertura de capacitacion', d.cobertura_capacitacion === null ? 'Sin datos' : `${d.cobertura_capacitacion} %`],
        ['Entregas de EPP', `${d.entregas_epp} (${d.elementos_epp} elementos)`]
      ],
      columnas: [
        { titulo: 'Tipo', campo: 'tipo', ancho: 1 }, { titulo: 'Fecha', campo: 'fecha_evento', ancho: 1.5 },
        { titulo: 'Lugar', campo: 'lugar', ancho: 1.5 }, { titulo: 'Empleado', campo: 'empleado', ancho: 1.6 },
        { titulo: 'Gravedad', campo: 'gravedad', ancho: 1 }, { titulo: 'Dias', campo: 'dias_incapacidad', ancho: 0.6, alinear: 'right', numerico: true },
        { titulo: 'ARL', campo: 'reportado_arl', ancho: 0.6 }, { titulo: 'Estado', campo: 'estado', ancho: 1.2 }
      ],
      filas: d.eventos
    };
  }
};

export const exportar = asyncHandler(async (req, res) => {
  const generador = REPORTES[req.params.reporte];
  if (!generador) throw new HttpError(404, `Reporte no disponible. Opciones: ${Object.keys(REPORTES).join(', ')}`);
  const formato = req.params.formato;
  if (!['pdf', 'excel'].includes(formato)) throw new HttpError(400, 'Formato no valido: use pdf o excel');
  const datos = await generador(req.query);
  const nombre = `${req.params.reporte}-${hoy()}`;
  auditar(req, 'EXPORTAR', 'reporte', null, `${req.params.reporte} ${formato}`);
  if (formato === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}.pdf"`);
    return res.send(await reportePDF(datos));
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}.xlsx"`);
  return res.send(await reporteExcel(datos));
});
