/**
 * Pruebas de integracion de la API de SIGA (node:test).
 * Requieren un MySQL o MariaDB de pruebas. Variables:
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD  (DB_NAME se fija en siga_test)
 * Ejecucion: npm test
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';

process.env.DB_NAME = process.env.DB_NAME_TEST || 'siga_test';
process.env.AUTO_MIGRATE = 'false';
const CLAVE = 'Siga2026*';
let servidor;
let base;
const tokens = {};

const api = async (metodo, ruta, { token, cuerpo, rol } = {}) => {
  const t = token || (rol ? tokens[rol] : undefined);
  const r = await fetch(`${base}/api${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  const tipo = r.headers.get('content-type') || '';
  const datos = tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { estado: r.status, datos, tipo };
};

const hoy = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const masDias = (n) => new Date(Date.now() - 5 * 3600 * 1000 + n * 86400000).toISOString().slice(0, 10);

before(async () => {
  const cx = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || ''
  });
  await cx.query(`DROP DATABASE IF EXISTS ${process.env.DB_NAME}`);
  await cx.query(`CREATE DATABASE ${process.env.DB_NAME}`);
  await cx.end();
  const { migrar } = await import('../app/db/migrate.js');
  await migrar({ demo: true });
  const { default: app } = await import('../app.js');
  await new Promise((ok) => { servidor = app.listen(0, ok); });
  base = `http://127.0.0.1:${servidor.address().port}`;
  const usuarios = {
    admin: 'admin@agroservices.com', supervisor: 'supervisor@agroservices.com', campo: 'campo@agroservices.com',
    campo2: 'campo2@agroservices.com', tecnico: 'tecnico@agroservices.com', inventario: 'inventario@agroservices.com',
    sst: 'sst@agroservices.com', gerente: 'gerente@agroservices.com'
  };
  for (const [rol, email] of Object.entries(usuarios)) {
    const r = await api('POST', '/login', { cuerpo: { email, password: CLAVE } });
    assert.equal(r.estado, 200, `login ${rol}`);
    tokens[rol] = r.datos.token;
  }
  const c = await api('POST', '/portal/login', { cuerpo: { email: 'compras@bellarosa.com.co', password: CLAVE } });
  tokens.cliente = c.datos.token;
});

after(async () => {
  servidor?.close();
  const { default: pool } = await import('../app/config/db.js');
  await pool.end();
});

describe('Autenticacion y seguridad (CU3.7, RF04)', () => {
  test('rechaza credenciales incorrectas con mensaje generico', async () => {
    const a = await api('POST', '/login', { cuerpo: { email: 'admin@agroservices.com', password: 'mala' } });
    const b = await api('POST', '/login', { cuerpo: { email: 'noexiste@x.com', password: CLAVE } });
    assert.equal(a.estado, 401);
    assert.equal(b.estado, 401);
    assert.equal(a.datos.error, b.datos.error);
  });

  test('exige token en rutas protegidas', async () => {
    assert.equal((await api('GET', '/empleados')).estado, 401);
    assert.equal((await api('GET', '/empleados', { token: 'abc' })).estado, 401);
  });

  test('aplica autorizacion por rol', async () => {
    assert.equal((await api('GET', '/empleados', { rol: 'campo' })).estado, 403);
    assert.equal((await api('POST', '/empleados', { rol: 'supervisor', cuerpo: {} })).estado, 403);
    assert.equal((await api('GET', '/empleados', { rol: 'cliente' })).estado, 403);
  });

  test('migra contrasenas en texto plano al primer inicio de sesion', async () => {
    const { default: pool } = await import('../app/config/db.js');
    await pool.query("UPDATE empleado SET password = 'Plano2026x' WHERE email = 'campo3@agroservices.com'");
    const r = await api('POST', '/login', { cuerpo: { email: 'campo3@agroservices.com', password: 'Plano2026x' } });
    assert.equal(r.estado, 200);
    const [[f]] = await pool.query("SELECT password FROM empleado WHERE email = 'campo3@agroservices.com'");
    assert.match(f.password, /^\$2[aby]\$/);
  });

  test('RF04: cambia la contrasena propia con politica de seguridad', async () => {
    const debil = await api('PUT', '/perfil/password', { rol: 'campo2', cuerpo: { actual: CLAVE, nueva: '1234' } });
    assert.equal(debil.estado, 400);
    const malaActual = await api('PUT', '/perfil/password', { rol: 'campo2', cuerpo: { actual: 'otra', nueva: 'Nueva2026x' } });
    assert.equal(malaActual.estado, 400);
    const ok = await api('PUT', '/perfil/password', { rol: 'campo2', cuerpo: { actual: CLAVE, nueva: 'Nueva2026x' } });
    assert.equal(ok.estado, 200);
    const login = await api('POST', '/login', { cuerpo: { email: 'campo2@agroservices.com', password: 'Nueva2026x' } });
    assert.equal(login.estado, 200);
    await api('PUT', '/perfil/password', { rol: 'campo2', cuerpo: { actual: 'Nueva2026x', nueva: CLAVE } });
  });

  test('el perfil no expone la contrasena', async () => {
    const r = await api('GET', '/perfil', { rol: 'admin' });
    assert.equal(r.estado, 200);
    assert.equal(r.datos.password, undefined);
    assert.equal(r.datos.rol, 'Administrador');
  });
});

describe('Modulo 3: empleados, clientes, contratos y respaldo', () => {
  let idEmpleado;
  test('RF03: crea empleado con contrasena cifrada y codigo QR', async () => {
    const r = await api('POST', '/empleados', { rol: 'admin', cuerpo: {
      nombre: 'Prueba Uno', documento: '555000111', email: 'prueba1@agroservices.com', password: 'Prueba2026x', rol: 'Trabajador de Campo', salario_base: 1423500
    } });
    assert.equal(r.estado, 201);
    idEmpleado = r.datos.id_empleado;
    const e = await api('GET', `/empleados/${idEmpleado}`, { rol: 'admin' });
    assert.match(e.datos.codigo_qr, /^QR-EMP-\d{3}$/);
    assert.equal(e.datos.password, undefined);
  });

  test('rechaza duplicados con 409', async () => {
    const r = await api('POST', '/empleados', { rol: 'admin', cuerpo: {
      nombre: 'Dup', documento: '555000111', email: 'otro@agroservices.com', password: 'Prueba2026x', rol: 'Supervisor'
    } });
    assert.equal(r.estado, 409);
  });

  test('PUT y DELETE sobre empleado inexistente responden 404 (MOD-SIGA-EMP-001)', async () => {
    assert.equal((await api('PUT', '/empleados/999999', { rol: 'admin', cuerpo: { telefono: '1' } })).estado, 404);
    assert.equal((await api('DELETE', '/empleados/999999', { rol: 'admin' })).estado, 404);
  });

  test('actualizacion parcial conserva los demas campos', async () => {
    const r = await api('PUT', `/empleados/${idEmpleado}`, { rol: 'admin', cuerpo: { telefono: '3009998877' } });
    assert.equal(r.estado, 200);
    const e = await api('GET', `/empleados/${idEmpleado}`, { rol: 'admin' });
    assert.equal(e.datos.telefono, '3009998877');
    assert.equal(e.datos.rol, 'Trabajador de Campo');
  });

  test('genera el codigo QR como imagen', async () => {
    const r = await api('GET', '/perfil/qr', { rol: 'campo' });
    assert.equal(r.estado, 200);
    assert.match(r.datos.imagen, /^data:image\/png;base64,/);
  });

  test('RF01 y RF02: cliente y contrato con validacion de fechas', async () => {
    const c = await api('POST', '/clientes', { rol: 'admin', cuerpo: {
      nombre_cliente: 'Cliente Prueba', tipo_cliente: 'Empresa', documento: '901000000-1', email: 'cp@test.com', password: 'Portal2026x'
    } });
    assert.equal(c.estado, 201);
    const malo = await api('POST', '/contratos', { rol: 'admin', cuerpo: {
      numero_contrato: 'CT-T-1', id_cliente: c.datos.id, tipo_contrato: 'Mixto', fecha_inicio: '2026-05-01', fecha_fin: '2026-01-01'
    } });
    assert.equal(malo.estado, 400);
    const k = await api('POST', '/contratos', { rol: 'admin', cuerpo: {
      numero_contrato: 'CT-T-1', id_cliente: c.datos.id, tipo_contrato: 'Mixto', fecha_inicio: '2026-01-01', fecha_fin: '2027-12-31', valor_total: 1000000
    } });
    assert.equal(k.estado, 201);
    const lista = await api('GET', '/contratos?estado=Vigente', { rol: 'supervisor' });
    assert.ok(lista.datos.some((x) => x.numero_contrato === 'CT-T-1'));
    const portal = await api('POST', '/portal/login', { cuerpo: { email: 'cp@test.com', password: 'Portal2026x' } });
    assert.equal(portal.estado, 200);
  });

  test('no elimina un cliente con contratos asociados', async () => {
    const [cliente] = (await api('GET', '/clientes', { rol: 'admin' })).datos.filter((c) => c.documento === '900456123-1');
    assert.equal((await api('DELETE', `/clientes/${cliente.id_cliente}`, { rol: 'admin' })).estado, 409);
  });

  test('RF05: respaldo manual descargable con todas las tablas', async () => {
    const r = await api('GET', '/respaldo', { rol: 'admin' });
    assert.equal(r.estado, 200);
    assert.equal(Object.keys(r.datos.tablas).length, 23);
    assert.equal((await api('GET', '/respaldo', { rol: 'gerente' })).estado, 403);
  });

  test('RNF07: registra la auditoria de las operaciones', async () => {
    const r = await api('GET', '/auditoria', { rol: 'admin' });
    assert.ok(r.datos.some((a) => a.accion === 'CREAR' && a.entidad === 'empleado'));
  });
});

describe('Modulo 1: servicios agricolas', () => {
  let idLabor;
  let ids;
  before(async () => {
    const contratos = (await api('GET', '/contratos', { rol: 'supervisor' })).datos;
    const servicios = (await api('GET', '/servicios', { rol: 'supervisor' })).datos;
    const empleados = (await api('GET', '/empleados?rol=Trabajador de Campo', { rol: 'supervisor' })).datos;
    ids = {
      contrato: contratos.find((c) => c.numero_contrato === 'CT-2026-001').id_contrato,
      contratoFinalizado: contratos.find((c) => c.numero_contrato === 'CT-2025-014').id_contrato,
      servicio: servicios.find((s) => s.nombre_servicio === 'Desbotone').id_servicio,
      tecnologico: servicios.find((s) => s.tipo_servicio === 'Tecnologico').id_servicio,
      campo: empleados.find((e) => e.email === 'campo@agroservices.com').id_empleado,
      tecnico: (await api('GET', '/empleados?rol=Tecnico Electronico', { rol: 'supervisor' })).datos[0].id_empleado
    };
  });

  test('RF07: programa una labor y valida disponibilidad, contrato y rol', async () => {
    const base = { id_contrato: ids.contrato, id_servicio: ids.servicio, id_empleado: ids.campo, tipo_labor: 'Desbotone',
      ubicacion: 'Bloque 8', latitud: 4.7381, longitud: -74.2689, fecha_programada: masDias(5), hora_programada: '07:00:00', cantidad: 8 };
    const r = await api('POST', '/labores', { rol: 'supervisor', cuerpo: base });
    assert.equal(r.estado, 201);
    idLabor = r.datos.id;
    assert.equal((await api('POST', '/labores', { rol: 'supervisor', cuerpo: base })).estado, 409);
    assert.equal((await api('POST', '/labores', { rol: 'supervisor', cuerpo: { ...base, hora_programada: '13:00:00', id_empleado: ids.tecnico } })).estado, 400);
    assert.equal((await api('POST', '/labores', { rol: 'supervisor', cuerpo: { ...base, hora_programada: '13:00:00', id_contrato: ids.contratoFinalizado } })).estado, 400);
    assert.equal((await api('POST', '/labores', { rol: 'supervisor', cuerpo: { ...base, hora_programada: '13:00:00', id_servicio: ids.tecnologico } })).estado, 400);
    assert.equal((await api('POST', '/labores', { rol: 'campo', cuerpo: base })).estado, 403);
  });

  test('el trabajador solo ve sus propias labores', async () => {
    const r = await api('GET', '/labores', { rol: 'campo' });
    assert.ok(r.datos.length > 0);
    assert.ok(r.datos.every((l) => l.id_empleado === ids.campo));
    assert.equal((await api('POST', `/labores/${idLabor}/iniciar`, { rol: 'campo2', cuerpo: {} })).estado, 403);
  });

  test('RF08 a RF10: inicio con GPS, evidencia y finalizacion', async () => {
    assert.equal((await api('POST', `/labores/${idLabor}/finalizar`, { rol: 'campo', cuerpo: { resultado: 'x', porcentaje_cumplimiento: 100 } })).estado, 409);
    const ini = await api('POST', `/labores/${idLabor}/iniciar`, { rol: 'campo', cuerpo: { latitud: 4.7600, longitud: -74.2689 } });
    assert.equal(ini.estado, 200);
    assert.match(ini.datos.advertencia, /m del lugar programado/);
    const img = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
    assert.equal((await api('POST', `/labores/${idLabor}/evidencias`, { rol: 'campo', cuerpo: { imagen: 'texto' } })).estado, 400);
    const ev = await api('POST', `/labores/${idLabor}/evidencias`, { rol: 'campo', cuerpo: { imagen: img, comentario: 'Avance camas 1 a 10', latitud: 4.7381, longitud: -74.2689 } });
    assert.equal(ev.estado, 201);
    assert.equal((await api('POST', `/labores/${idLabor}/finalizar`, { rol: 'campo', cuerpo: { resultado: 'ok', porcentaje_cumplimiento: 140 } })).estado, 400);
    const fin = await api('POST', `/labores/${idLabor}/finalizar`, { rol: 'campo', cuerpo: { resultado: 'Bloque completo', porcentaje_cumplimiento: 95 } });
    assert.equal(fin.estado, 200);
    const l = await api('GET', `/labores/${idLabor}`, { rol: 'supervisor' });
    assert.equal(l.datos.estado, 'Finalizada');
    assert.equal(l.datos.evidencias, 1);
  });

  test('RF12: sincroniza acciones registradas sin conexion', async () => {
    const nueva = await api('POST', '/labores', { rol: 'supervisor', cuerpo: { id_contrato: ids.contrato, id_servicio: ids.servicio, id_empleado: ids.campo,
      tipo_labor: 'Desbotone', ubicacion: 'Bloque 9', fecha_programada: hoy(), hora_programada: '11:00:00' } });
    const id = nueva.datos.id;
    const ahora = Date.now();
    const r = await api('POST', '/labores/sincronizar', { rol: 'campo', cuerpo: { acciones: [
      { id_local: 'b', tipo: 'finalizar', id_labor: id, fecha_hora: new Date(ahora - 60000).toISOString(), datos: { resultado: 'Sin senal', porcentaje_cumplimiento: 90 } },
      { id_local: 'a', tipo: 'iniciar', id_labor: id, fecha_hora: new Date(ahora - 3600000).toISOString(), datos: {} }
    ] } });
    assert.equal(r.estado, 200);
    assert.ok(r.datos.resultados.every((x) => x.ok), JSON.stringify(r.datos));
    const l = await api('GET', `/labores/${id}`, { rol: 'supervisor' });
    assert.equal(l.datos.estado, 'Finalizada');
    assert.equal(l.datos.registrada_offline, 1);
  });

  test('RF11: resumen del avance por contrato', async () => {
    const r = await api('GET', '/labores/resumen', { rol: 'supervisor' });
    assert.ok(r.datos.por_contrato.length >= 2);
  });

  test('no elimina labores iniciadas', async () => {
    assert.equal((await api('DELETE', `/labores/${idLabor}`, { rol: 'supervisor' })).estado, 409);
  });
});

describe('Modulo 2: servicios tecnologicos', () => {
  let idEquipo;
  let codigo;
  test('RF13: registra equipo con codigo de seguimiento', async () => {
    const clientes = (await api('GET', '/clientes', { rol: 'tecnico' })).datos;
    const r = await api('POST', '/equipos', { rol: 'tecnico', cuerpo: { id_cliente: clientes[0].id_cliente, tipo_equipo: 'Portatil', marca: 'Dell', problema_reportado: 'Pantalla azul' } });
    assert.equal(r.estado, 201);
    idEquipo = r.datos.id;
    codigo = r.datos.codigo_seguimiento;
    assert.match(codigo, /^[A-Z0-9]{8}$/);
  });

  test('RF16: no inicia la reparacion sin diagnostico ni cotizacion aprobada', async () => {
    assert.equal((await api('PUT', `/equipos/${idEquipo}/estado`, { rol: 'tecnico', cuerpo: { estado: 'En proceso' } })).estado, 409);
    assert.equal((await api('PUT', `/equipos/${idEquipo}/diagnostico`, { rol: 'tecnico', cuerpo: { diagnostico: 'Memoria RAM danada', valor_cotizacion: 180000 } })).estado, 200);
    assert.equal((await api('PUT', `/equipos/${idEquipo}/estado`, { rol: 'tecnico', cuerpo: { estado: 'En proceso' } })).estado, 409);
    assert.equal((await api('PUT', `/equipos/${idEquipo}/aprobar-cotizacion`, { rol: 'tecnico' })).estado, 200);
    assert.equal((await api('PUT', `/equipos/${idEquipo}/estado`, { rol: 'tecnico', cuerpo: { estado: 'En proceso' } })).estado, 200);
    assert.equal((await api('PUT', `/equipos/${idEquipo}/estado`, { rol: 'tecnico', cuerpo: { estado: 'Recibido' } })).estado, 409);
  });

  test('RF15 y RF27: el repuesto descuenta inventario y genera orden al llegar al minimo', async () => {
    const ssd = (await api('GET', '/inventario', { rol: 'tecnico' })).datos.find((p) => p.codigo_producto === 'REP-001');
    const exceso = await api('POST', `/equipos/${idEquipo}/repuestos`, { rol: 'tecnico', cuerpo: { id_inventario: ssd.id_inventario, cantidad: 999 } });
    assert.equal(exceso.estado, 409);
    const r = await api('POST', `/equipos/${idEquipo}/repuestos`, { rol: 'tecnico', cuerpo: { id_inventario: ssd.id_inventario, cantidad: 2 } });
    assert.equal(r.estado, 201);
    assert.ok(r.datos.orden_generada, 'debe generar orden automatica');
    const despues = (await api('GET', `/inventario/${ssd.id_inventario}`, { rol: 'tecnico' })).datos;
    assert.equal(despues.cantidad_disponible, ssd.cantidad_disponible - 2);
    const e = await api('GET', `/equipos/${idEquipo}`, { rol: 'tecnico' });
    assert.equal(e.datos.repuestos.length, 1);
  });

  test('RF17: consulta publica sin datos personales', async () => {
    const r = await api('GET', `/seguimiento/${codigo.toLowerCase()}`);
    assert.equal(r.estado, 200);
    assert.equal(r.datos.estado, 'En proceso');
    assert.equal(r.datos.nombre_cliente, undefined);
    assert.equal((await api('GET', '/seguimiento/ZZZZZZZZ')).estado, 404);
  });
});

describe('Modulo 5: inventario', () => {
  test('RF23 y RF26: ingreso y consumo con control de existencia', async () => {
    const p = (await api('GET', '/inventario', { rol: 'inventario' })).datos.find((x) => x.codigo_producto === 'INS-002');
    assert.equal((await api('POST', `/inventario/${p.id_inventario}/ingreso`, { rol: 'inventario', cuerpo: { cantidad: 20, referencia: 'Factura 100' } })).estado, 201);
    assert.equal((await api('POST', `/inventario/${p.id_inventario}/consumo`, { rol: 'campo', cuerpo: { cantidad: 5, referencia: 'Labor' } })).estado, 201);
    assert.equal((await api('POST', `/inventario/${p.id_inventario}/consumo`, { rol: 'campo', cuerpo: { cantidad: -5 } })).estado, 400);
    const d = (await api('GET', `/inventario/${p.id_inventario}`, { rol: 'inventario' })).datos;
    assert.equal(d.cantidad_disponible, p.cantidad_disponible + 15);
    assert.ok(d.movimientos.length >= 2);
  });

  test('RF25: alertas de stock minimo', async () => {
    const r = await api('GET', '/inventario/alertas', { rol: 'inventario' });
    assert.ok(r.datos.some((x) => x.codigo_producto === 'INS-003'));
  });

  test('RF27 y RF28: generar, aprobar y recibir ordenes de compra', async () => {
    const g = await api('POST', '/ordenes/generar', { rol: 'inventario' });
    assert.equal(g.estado, 201);
    const pendientes = (await api('GET', '/ordenes?estado=Pendiente', { rol: 'inventario' })).datos;
    assert.ok(pendientes.length > 0);
    const orden = pendientes[0];
    assert.equal((await api('PUT', `/ordenes/${orden.id_orden}/aprobar`, { rol: 'inventario' })).estado, 403);
    assert.equal((await api('PUT', `/ordenes/${orden.id_orden}/recibir`, { rol: 'inventario' })).estado, 409);
    assert.equal((await api('PUT', `/ordenes/${orden.id_orden}/aprobar`, { rol: 'admin' })).estado, 200);
    assert.equal((await api('PUT', `/ordenes/${orden.id_orden}/aprobar`, { rol: 'admin' })).estado, 409);
    assert.equal((await api('PUT', `/ordenes/${orden.id_orden}/recibir`, { rol: 'inventario' })).estado, 200);
  });
});

describe('Modulo 4: gestion de personal', () => {
  test('RF19: el QR registra entrada y luego salida', async () => {
    const e = await api('POST', '/asistencia/registrar', { rol: 'supervisor', cuerpo: { codigo_qr: 'QR-EMP-004' } });
    assert.equal(e.estado, 201);
    assert.equal(e.datos.tipo, 'Entrada');
    const dup = await api('POST', '/asistencia/registrar', { rol: 'supervisor', cuerpo: { codigo_qr: 'QR-EMP-004' } });
    assert.equal(dup.estado, 409);
    const { default: pool } = await import('../app/config/db.js');
    await pool.query('UPDATE asistencia SET hora_entrada = DATE_SUB(hora_entrada, INTERVAL 2 HOUR) WHERE id_asistencia = ?', [e.datos.registro.id_asistencia]);
    const s = await api('POST', '/asistencia/registrar', { rol: 'supervisor', cuerpo: { codigo_qr: 'QR-EMP-004' } });
    assert.equal(s.datos.tipo, 'Salida');
    assert.equal((await api('POST', '/asistencia/registrar', { rol: 'supervisor', cuerpo: { codigo_qr: 'NO-EXISTE' } })).estado, 404);
  });

  test('RF20 y RF21: asignar y completar tareas', async () => {
    const campo = (await api('GET', '/empleados?rol=Trabajador de Campo', { rol: 'supervisor' })).datos.find((e) => e.email === 'campo@agroservices.com');
    const t = await api('POST', '/tareas', { rol: 'supervisor', cuerpo: { id_empleado: campo.id_empleado, titulo: 'Revisar tijeras', fecha_inicio: hoy(), fecha_limite: masDias(2), prioridad: 'Alta' } });
    assert.equal(t.estado, 201);
    const mias = await api('GET', '/tareas/mias', { rol: 'campo' });
    assert.ok(mias.datos.some((x) => x.id_tarea === t.datos.id));
    assert.equal((await api('PUT', `/tareas/${t.datos.id}/avance`, { rol: 'campo2', cuerpo: { estado: 'Completada' } })).estado, 403);
    assert.equal((await api('PUT', `/tareas/${t.datos.id}/avance`, { rol: 'campo', cuerpo: { estado: 'Completada' } })).estado, 200);
    assert.equal((await api('PUT', `/tareas/${t.datos.id}/avance`, { rol: 'campo', cuerpo: { estado: 'Completada' } })).estado, 409);
  });

  test('RF22: calcula la nomina con asistencia y productividad', async () => {
    const r = await api('POST', '/nomina/calcular', { rol: 'admin', cuerpo: { periodo_inicio: masDias(-14), periodo_fin: hoy() } });
    assert.equal(r.estado, 201);
    const campo = r.datos.liquidaciones.find((l) => l.nombre === 'Carlos Gomez');
    assert.ok(campo.dias_trabajados >= 2);
    assert.ok(campo.bonificacion > 0, 'labores con cumplimiento >= 90 % generan bonificacion');
    assert.equal(campo.total, Math.round((campo.valor_dias + campo.bonificacion - campo.deducciones) * 100) / 100);
    const otra = await api('POST', '/nomina/calcular', { rol: 'admin', cuerpo: { periodo_inicio: masDias(-14), periodo_fin: hoy() } });
    assert.equal(otra.estado, 201, 'recalcular el mismo periodo reemplaza la liquidacion');
    assert.equal((await api('POST', '/nomina/calcular', { rol: 'gerente', cuerpo: {} })).estado, 403);
  });

  test('RF40: productividad individual', async () => {
    const r = await api('GET', '/reportes/productividad', { rol: 'supervisor' });
    assert.equal(r.estado, 200);
    assert.ok(r.datos.filas.find((f) => f.nombre === 'Carlos Gomez').labores_finalizadas >= 1);
  });
});

describe('Modulo 6: seguridad y salud en el trabajo', () => {
  test('RF29: capacitacion con convocados, asistencia y certificado', async () => {
    const empleados = (await api('GET', '/empleados?rol=Trabajador de Campo', { rol: 'sst' })).datos.map((e) => e.id_empleado);
    const c = await api('POST', '/capacitaciones', { rol: 'sst', cuerpo: { tema: 'Trabajo en alturas', fecha_capacitacion: hoy(), participantes: empleados } });
    assert.equal(c.estado, 201);
    assert.equal((await api('PUT', `/capacitaciones/${c.datos.id}/asistencia`, { rol: 'sst', cuerpo: { id_empleado: empleados[0], asistio: true } })).estado, 200);
    const d = await api('GET', `/capacitaciones/${c.datos.id}`, { rol: 'sst' });
    assert.equal(d.datos.convocados, empleados.length);
    assert.match(d.datos.participantes.find((p) => p.id_empleado === empleados[0]).certificado, /^CERT-/);
  });

  test('RF30: entrega de EPP descuenta el inventario', async () => {
    const guantes = (await api('GET', '/inventario', { rol: 'sst' })).datos.find((p) => p.codigo_producto === 'EPP-001');
    const campo = (await api('GET', '/empleados?rol=Trabajador de Campo', { rol: 'sst' })).datos[0];
    const r = await api('POST', '/epp', { rol: 'sst', cuerpo: { id_empleado: campo.id_empleado, id_inventario: guantes.id_inventario, cantidad: 2, fecha_entrega: hoy(), fecha_reposicion: masDias(30) } });
    assert.equal(r.estado, 201);
    const despues = (await api('GET', `/inventario/${guantes.id_inventario}`, { rol: 'sst' })).datos;
    assert.equal(despues.cantidad_disponible, guantes.cantidad_disponible - 2);
  });

  test('RF31: incidente con seguimiento y cierre condicionado', async () => {
    const i = await api('POST', '/incidentes', { rol: 'supervisor', cuerpo: { tipo: 'Accidente', fecha_evento: `${hoy()} 09:00:00`, lugar: 'Bloque 2', descripcion: 'Golpe leve', gravedad: 'Leve', dias_incapacidad: 1 } });
    assert.equal(i.estado, 201);
    assert.equal((await api('PUT', `/incidentes/${i.datos.id}`, { rol: 'sst', cuerpo: { estado: 'Cerrado' } })).estado, 400);
    assert.equal((await api('PUT', `/incidentes/${i.datos.id}`, { rol: 'sst', cuerpo: { estado: 'Cerrado', acciones_correctivas: 'Senalizacion', reportado_arl: 1 } })).estado, 200);
  });

  test('RF32: indicadores de la Resolucion 0312 y exportacion', async () => {
    const r = await api('GET', `/reportes/sst?desde=${masDias(-60)}&hasta=${hoy()}`, { rol: 'sst' });
    assert.equal(r.estado, 200);
    assert.ok(r.datos.accidentes >= 2);
    assert.equal(r.datos.indice_frecuencia, Math.round((r.datos.accidentes / r.datos.trabajadores) * 10000) / 100);
    const pdf = await api('GET', `/reportes/sst/pdf?desde=${masDias(-60)}`, { rol: 'sst' });
    assert.equal(pdf.estado, 200);
    assert.equal(pdf.datos.subarray(0, 4).toString(), '%PDF');
  });
});

describe('Modulo 7: facturacion', () => {
  let idFactura;
  test('RF33: factura a partir de labores finalizadas sin duplicar', async () => {
    const k = (await api('GET', '/contratos', { rol: 'admin' })).datos.find((c) => c.numero_contrato === 'CT-2026-001');
    const pend = await api('GET', `/facturas/pendientes-labores?id_contrato=${k.id_contrato}`, { rol: 'admin' });
    assert.ok(pend.datos.length >= 2);
    const f = await api('POST', '/facturas/desde-labores', { rol: 'admin', cuerpo: { id_contrato: k.id_contrato } });
    assert.equal(f.estado, 201, JSON.stringify(f.datos));
    assert.match(f.datos.numero_factura, /^FV-\d{4}-\d{4}$/);
    idFactura = f.datos.id;
    assert.equal((await api('POST', '/facturas/desde-labores', { rol: 'admin', cuerpo: { id_contrato: k.id_contrato } })).estado, 409);
  });

  test('calcula IVA y total de una factura manual', async () => {
    const cliente = (await api('GET', '/clientes', { rol: 'admin' })).datos[0];
    const r = await api('POST', '/facturas', { rol: 'admin', cuerpo: { id_cliente: cliente.id_cliente, forma_pago: 'Contado', detalles: [
      { descripcion: 'Servicio A', cantidad: 2, valor_unitario: 100000 }, { descripcion: 'Servicio B', cantidad: 1, valor_unitario: 50000 }
    ] } });
    assert.equal(r.estado, 201);
    assert.equal(r.datos.total, 297500);
    assert.equal((await api('POST', '/facturas', { rol: 'admin', cuerpo: { id_cliente: cliente.id_cliente, detalles: [] } })).estado, 400);
  });

  test('RF35: pagos parciales y totales actualizan la cartera', async () => {
    const f = (await api('GET', `/facturas/${idFactura}`, { rol: 'admin' })).datos;
    assert.equal((await api('POST', `/facturas/${idFactura}/pagos`, { rol: 'admin', cuerpo: { valor: f.total + 1 } })).estado, 400);
    const p1 = await api('POST', `/facturas/${idFactura}/pagos`, { rol: 'admin', cuerpo: { valor: 100000, medio_pago: 'Transferencia', referencia: 'T-1' } });
    assert.equal(p1.datos.estado, 'Pagada parcialmente');
    assert.equal((await api('PUT', `/facturas/${idFactura}/anular`, { rol: 'admin' })).estado, 409);
    const p2 = await api('POST', `/facturas/${idFactura}/pagos`, { rol: 'admin', cuerpo: { valor: p1.datos.saldo } });
    assert.equal(p2.datos.estado, 'Pagada');
    const cartera = await api('GET', '/cartera', { rol: 'gerente' });
    assert.ok(cartera.datos.length > 0);
  });

  test('RF34: informa si el correo no esta configurado', async () => {
    const r = await api('POST', `/facturas/${idFactura}/enviar`, { rol: 'admin' });
    assert.equal(r.estado, 503);
  });

  test('genera la factura en PDF', async () => {
    const r = await api('GET', `/facturas/${idFactura}/pdf`, { rol: 'gerente' });
    assert.equal(r.estado, 200);
    assert.equal(r.datos.subarray(0, 4).toString(), '%PDF');
  });
});

describe('Modulo 8: reportes', () => {
  test('RF37: tablero con indicadores', async () => {
    const r = await api('GET', '/reportes/dashboard', { rol: 'gerente' });
    assert.equal(r.estado, 200);
    assert.ok(r.datos.finanzas.pendiente >= 0);
    assert.ok(Array.isArray(r.datos.series.facturacion));
  });

  test('RF38: rentabilidad por cliente y por servicio', async () => {
    const c = await api('GET', '/reportes/rentabilidad?agrupar=cliente', { rol: 'gerente' });
    const s = await api('GET', '/reportes/rentabilidad?agrupar=servicio', { rol: 'gerente' });
    assert.ok(c.datos.filas.length > 0);
    assert.ok(s.datos.filas.length > 0);
    const f = c.datos.filas[0];
    assert.equal(f.utilidad, Math.round((f.ingresos - f.costos) * 100) / 100);
  });

  test('RF39: exporta reportes a Excel y PDF', async () => {
    for (const rep of ['rentabilidad', 'productividad', 'cartera', 'inventario']) {
      const x = await api('GET', `/reportes/${rep}/excel`, { rol: 'gerente' });
      assert.equal(x.estado, 200, rep);
      assert.equal(x.datos.subarray(0, 2).toString(), 'PK');
    }
    assert.equal((await api('GET', '/reportes/rentabilidad/pdf', { rol: 'supervisor' })).estado, 403);
    assert.equal((await api('GET', '/reportes/otro/pdf', { rol: 'gerente' })).estado, 403);
  });
});

describe('Portal de clientes', () => {
  test('RF06: solicita un servicio', async () => {
    const servicios = (await api('GET', '/portal/servicios', { rol: 'cliente' })).datos;
    assert.equal((await api('POST', '/portal/solicitudes', { rol: 'cliente', cuerpo: { id_servicio: servicios[0].id_servicio, fecha_deseada: '2020-01-01' } })).estado, 400);
    const r = await api('POST', '/portal/solicitudes', { rol: 'cliente', cuerpo: { id_servicio: servicios[0].id_servicio, fecha_deseada: masDias(10), descripcion: 'Bloque 12' } });
    assert.equal(r.estado, 201);
    const s = await api('PUT', `/solicitudes/${r.datos.id}`, { rol: 'supervisor', cuerpo: { estado: 'Aprobada', respuesta: 'Programada para la fecha' } });
    assert.equal(s.estado, 200);
  });

  test('RF36: el cliente solo ve sus facturas', async () => {
    const mias = await api('GET', '/portal/facturas', { rol: 'cliente' });
    assert.ok(mias.datos.length > 0);
    const ajena = (await api('GET', '/facturas', { rol: 'admin' })).datos.find((f) => f.nombre_cliente !== 'Floricultora Bella Rosa S.A.S.');
    assert.equal((await api('GET', `/portal/facturas/${ajena.id_factura}`, { rol: 'cliente' })).estado, 404);
    assert.equal((await api('GET', '/facturas', { rol: 'cliente' })).estado, 403);
  });

  test('el cliente consulta sus equipos y aprueba la cotizacion', async () => {
    const r = await api('GET', '/portal/resumen', { rol: 'cliente' });
    assert.equal(r.estado, 200);
    const equipos = await api('GET', '/portal/equipos', { rol: 'cliente' });
    assert.ok(Array.isArray(equipos.datos));
  });
});
