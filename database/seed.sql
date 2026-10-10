-- =====================================================================
-- Datos de demostracion de SIGA
-- Se cargan una sola vez: la migracion automatica solo ejecuta este archivo
-- cuando la tabla cliente esta vacia. Las fechas operativas son relativas a
-- la fecha actual para que el tablero siempre muestre informacion reciente.
-- Contrasena de todos los usuarios de demostracion: Siga2026*
-- =====================================================================
SET @pwd = '$2b$10$6cjrmFQkPNKjB2Ys3ndr1OzLS6Ghjy3OlsScv.B2ezAZCHgd.yb3O';

-- ---------- Empleados (uno o mas por rol) ----------
INSERT IGNORE INTO empleado (nombre, documento, email, telefono, password, rol, salario_base, codigo_qr, estado, fecha_ingreso) VALUES
  ('Fredy Vargas',    '1012345678', 'admin@agroservices.com',      '3001112233', @pwd, 'Administrador',       2500000.00, 'QR-EMP-001', 'Activo', '2025-01-15'),
  ('Laura Martinez',  '1023456789', 'supervisor@agroservices.com', '3004445566', @pwd, 'Supervisor',          1800000.00, 'QR-EMP-002', 'Activo', '2025-02-01'),
  ('Carlos Gomez',    '1034567890', 'campo@agroservices.com',      '3007778899', @pwd, 'Trabajador de Campo', 1423500.00, 'QR-EMP-003', 'Activo', '2025-03-10'),
  ('Diego Herrera',   '1045678901', 'tecnico@agroservices.com',    '3012223344', @pwd, 'Tecnico Electronico', 1900000.00, 'QR-EMP-004', 'Activo', '2025-04-07'),
  ('Marta Rincon',    '1056789012', 'inventario@agroservices.com', '3015556677', @pwd, 'Jefe de Inventario',  1850000.00, 'QR-EMP-005', 'Activo', '2025-05-12'),
  ('Paola Medina',    '1067890123', 'sst@agroservices.com',        '3018889900', @pwd, 'Responsable SST',     2100000.00, 'QR-EMP-006', 'Activo', '2025-06-02'),
  ('Jorge Castillo',  '1078901234', 'gerente@agroservices.com',    '3021112233', @pwd, 'Gerente',             4200000.00, 'QR-EMP-007', 'Activo', '2025-01-02'),
  ('Andres Pinto',    '1089012345', 'campo2@agroservices.com',     '3024445566', @pwd, 'Trabajador de Campo', 1423500.00, 'QR-EMP-008', 'Activo', '2025-07-21'),
  ('Sandra Rojas',    '1090123456', 'campo3@agroservices.com',     '3027778899', @pwd, 'Trabajador de Campo', 1423500.00, 'QR-EMP-009', 'Activo', '2025-08-04');

-- ---------- Clientes ----------
INSERT IGNORE INTO cliente (nombre_cliente, tipo_cliente, documento, email, telefono, direccion, ciudad, representante, password) VALUES
  ('Floricultora Bella Rosa S.A.S.', 'Empresa floricultora', '900456123-1', 'compras@bellarosa.com.co',    '6018251234', 'Vereda El Corzo, km 3', 'Madrid',     'Patricia Leon',    @pwd),
  ('Cultivos San Isidro S.A.S.',     'Empresa floricultora', '900789456-2', 'gerencia@sanisidro.com.co',   '6018259876', 'Vereda Puente de Piedra', 'Madrid',   'Hernan Acosta',    @pwd),
  ('Flores del Valle Verde Ltda.',   'Empresa floricultora', '800321654-3', 'admin@valleverde.com.co',     '6018223344', 'Km 5 via Facatativa',   'Facatativa', 'Gloria Bermudez',  NULL),
  ('Juan Carlos Moreno',             'Persona natural',      '79845123',    'jcmoreno@correo.com',         '3105551234', 'Calle 7 No. 4-21',      'Madrid',     NULL,               NULL);

-- ---------- Servicios ----------
INSERT IGNORE INTO servicio (nombre_servicio, tipo_servicio, descripcion, unidad_medida, tarifa_base) VALUES
  ('Desbotone',                 'Agricola',    'Retiro de botones laterales para formar el tallo de la flor', 'Hora',    18000),
  ('Corte de flor',             'Agricola',    'Corte de tallos en punto de apertura y traslado a poscosecha', 'Hora',   19000),
  ('Fumigacion',                'Agricola',    'Aplicacion de fungicidas e insecticidas por bloque',          'Bloque',  95000),
  ('Erradicacion de maleza',    'Agricola',    'Limpieza manual de camas y caminos',                          'Hora',    16000),
  ('Siembra de esquejes',       'Agricola',    'Siembra de esquejes enraizados en cama',                      'Millar',  60000),
  ('Diagnostico de equipo',     'Tecnologico', 'Revision tecnica y cotizacion de la reparacion',              'Unidad',  35000),
  ('Reparacion de computador',  'Tecnologico', 'Cambio de componentes y puesta a punto',                      'Unidad', 120000),
  ('Mantenimiento preventivo',  'Tecnologico', 'Limpieza interna, cambio de pasta termica y actualizaciones', 'Unidad',  80000);

-- ---------- Contratos ----------
INSERT IGNORE INTO contrato (numero_contrato, id_cliente, tipo_contrato, descripcion, fecha_inicio, fecha_fin, valor_total, estado)
SELECT 'CT-2026-001', id_cliente, 'Labores agricolas', 'Desbotone, corte y fumigacion en los bloques 1 a 8', '2026-01-15', '2026-12-31', 48000000, 'Vigente' FROM cliente WHERE documento = '900456123-1';
INSERT IGNORE INTO contrato (numero_contrato, id_cliente, tipo_contrato, descripcion, fecha_inicio, fecha_fin, valor_total, estado)
SELECT 'CT-2026-002', id_cliente, 'Mixto', 'Labores de temporada y soporte a los equipos de poscosecha', '2026-02-01', '2027-01-31', 36500000, 'Vigente' FROM cliente WHERE documento = '900789456-2';
INSERT IGNORE INTO contrato (numero_contrato, id_cliente, tipo_contrato, descripcion, fecha_inicio, fecha_fin, valor_total, estado)
SELECT 'CT-2025-014', id_cliente, 'Labores agricolas', 'Erradicacion de maleza temporada 2025', '2025-03-01', '2025-12-15', 12800000, 'Finalizado' FROM cliente WHERE documento = '800321654-3';

-- ---------- Inventario ----------
INSERT IGNORE INTO inventario (codigo_producto, nombre_producto, categoria, unidad, cantidad_disponible, cantidad_minima, precio_unitario, proveedor, ubicacion_almacen) VALUES
  ('INS-001', 'Fungicida sistemico 1 L',       'Insumo agricola',      'Litro',  24, 10,  68000, 'Agroinsumos de la Sabana', 'Bodega A'),
  ('INS-002', 'Fertilizante NPK 15-15-15',     'Insumo agricola',      'Kg',    180, 100,   4200, 'Agroinsumos de la Sabana', 'Bodega A'),
  ('INS-003', 'Insecticida de contacto 1 L',   'Insumo agricola',      'Litro',   6, 8,   54000, 'Quimicos del Campo',       'Bodega A'),
  ('REP-001', 'Disco SSD 480 GB',              'Repuesto electronico', 'Unidad',  5, 3,  145000, 'Tecnoparte Bogota',        'Taller'),
  ('REP-002', 'Memoria RAM DDR4 8 GB',         'Repuesto electronico', 'Unidad',  2, 4,  118000, 'Tecnoparte Bogota',        'Taller'),
  ('REP-003', 'Fuente de poder 500 W',         'Repuesto electronico', 'Unidad',  3, 2,  165000, 'Tecnoparte Bogota',        'Taller'),
  ('REP-004', 'Pasta termica 4 g',             'Repuesto electronico', 'Unidad', 10, 5,   18000, 'Tecnoparte Bogota',        'Taller'),
  ('HER-001', 'Tijera de poda profesional',    'Herramienta',          'Unidad', 14, 6,   62000, 'Ferreteria Madrid',        'Bodega B'),
  ('EPP-001', 'Guantes de nitrilo',            'EPP',                  'Par',    40, 30,   6500, 'Seguridad Industrial SAS', 'Bodega B'),
  ('EPP-002', 'Respirador media cara con filtro', 'EPP',               'Unidad',  4, 6,   78000, 'Seguridad Industrial SAS', 'Bodega B'),
  ('EPP-003', 'Gafas de seguridad',            'EPP',                  'Unidad', 18, 10,   9800, 'Seguridad Industrial SAS', 'Bodega B'),
  ('EPP-004', 'Botas de caucho',               'EPP',                  'Par',    12, 8,   42000, 'Seguridad Industrial SAS', 'Bodega B');

-- ---------- Labores ----------
INSERT INTO labor (id_contrato, id_servicio, id_empleado, tipo_labor, descripcion, ubicacion, latitud, longitud, fecha_programada, hora_programada, cantidad, estado, hora_inicio, lat_inicio, lon_inicio, hora_fin, lat_fin, lon_fin, resultado, porcentaje_cumplimiento)
SELECT c.id_contrato, s.id_servicio, e.id_empleado, 'Desbotone', 'Desbotone de rosa variedad Freedom', 'Bloque 3, camas 1 a 40', 4.7381200, -74.2689300,
       DATE_SUB(CURDATE(), INTERVAL 6 DAY), '07:00:00', 8, 'Finalizada',
       TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 6 DAY), '07:04:00'), 4.7381500, -74.2689100,
       TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 6 DAY), '15:10:00'), 4.7381300, -74.2689000,
       'Se completaron las 40 camas del bloque', 100
FROM contrato c, servicio s, empleado e
WHERE c.numero_contrato = 'CT-2026-001' AND s.nombre_servicio = 'Desbotone' AND e.email = 'campo@agroservices.com';

INSERT INTO labor (id_contrato, id_servicio, id_empleado, tipo_labor, descripcion, ubicacion, latitud, longitud, fecha_programada, hora_programada, cantidad, estado, hora_inicio, lat_inicio, lon_inicio, hora_fin, lat_fin, lon_fin, resultado, porcentaje_cumplimiento)
SELECT c.id_contrato, s.id_servicio, e.id_empleado, 'Corte de flor', 'Corte en punto de apertura para exportacion', 'Bloque 5', 4.7376800, -74.2701200,
       DATE_SUB(CURDATE(), INTERVAL 4 DAY), '06:30:00', 9, 'Finalizada',
       TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 4 DAY), '06:35:00'), 4.7377000, -74.2701000,
       TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 4 DAY), '15:20:00'), 4.7376900, -74.2701100,
       'Se cortaron 32 camas de 36 por lluvia en la tarde', 89
FROM contrato c, servicio s, empleado e
WHERE c.numero_contrato = 'CT-2026-001' AND s.nombre_servicio = 'Corte de flor' AND e.email = 'campo2@agroservices.com';

INSERT INTO labor (id_contrato, id_servicio, id_empleado, tipo_labor, descripcion, ubicacion, latitud, longitud, fecha_programada, hora_programada, cantidad, estado, hora_inicio, lat_inicio, lon_inicio, hora_fin, lat_fin, lon_fin, resultado, porcentaje_cumplimiento)
SELECT c.id_contrato, s.id_servicio, e.id_empleado, 'Fumigacion', 'Control preventivo de botrytis', 'Bloques 1 y 2', 4.7290400, -74.2598700,
       DATE_SUB(CURDATE(), INTERVAL 2 DAY), '07:00:00', 2, 'Finalizada',
       TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 2 DAY), '07:12:00'), 4.7290600, -74.2598500,
       TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 2 DAY), '12:40:00'), 4.7290500, -74.2598600,
       'Aplicacion completa en los dos bloques', 100
FROM contrato c, servicio s, empleado e
WHERE c.numero_contrato = 'CT-2026-002' AND s.nombre_servicio = 'Fumigacion' AND e.email = 'campo3@agroservices.com';

INSERT INTO labor (id_contrato, id_servicio, id_empleado, tipo_labor, descripcion, ubicacion, latitud, longitud, fecha_programada, hora_programada, cantidad, estado, hora_inicio, lat_inicio, lon_inicio)
SELECT c.id_contrato, s.id_servicio, e.id_empleado, 'Erradicacion de maleza', 'Limpieza de caminos internos', 'Bloque 7', 4.7368900, -74.2711500,
       CURDATE(), '07:00:00', 8, 'En proceso', TIMESTAMP(CURDATE(), '07:06:00'), 4.7369100, -74.2711300
FROM contrato c, servicio s, empleado e
WHERE c.numero_contrato = 'CT-2026-001' AND s.nombre_servicio = 'Erradicacion de maleza' AND e.email = 'campo2@agroservices.com';

INSERT INTO labor (id_contrato, id_servicio, id_empleado, tipo_labor, descripcion, ubicacion, latitud, longitud, fecha_programada, hora_programada, cantidad, estado)
SELECT c.id_contrato, s.id_servicio, e.id_empleado, 'Desbotone', 'Desbotone de rosa variedad Vendela', 'Bloque 4, camas 1 a 36', 4.7379600, -74.2694800,
       CURDATE(), '07:30:00', 8, 'Programada'
FROM contrato c, servicio s, empleado e
WHERE c.numero_contrato = 'CT-2026-001' AND s.nombre_servicio = 'Desbotone' AND e.email = 'campo@agroservices.com';

INSERT INTO labor (id_contrato, id_servicio, id_empleado, tipo_labor, descripcion, ubicacion, latitud, longitud, fecha_programada, hora_programada, cantidad, estado)
SELECT c.id_contrato, s.id_servicio, e.id_empleado, 'Siembra de esquejes', 'Renovacion de camas con variedad Explorer', 'Bloque 2', 4.7292100, -74.2601400,
       DATE_ADD(CURDATE(), INTERVAL 2 DAY), '07:00:00', 3, 'Programada'
FROM contrato c, servicio s, empleado e
WHERE c.numero_contrato = 'CT-2026-002' AND s.nombre_servicio = 'Siembra de esquejes' AND e.email = 'campo@agroservices.com';

INSERT INTO labor (id_contrato, id_servicio, id_empleado, tipo_labor, descripcion, ubicacion, latitud, longitud, fecha_programada, hora_programada, cantidad, estado)
SELECT c.id_contrato, s.id_servicio, e.id_empleado, 'Corte de flor', 'Corte para pedido de temporada', 'Bloque 6', 4.7374300, -74.2706600,
       DATE_ADD(CURDATE(), INTERVAL 3 DAY), '06:30:00', 9, 'Programada'
FROM contrato c, servicio s, empleado e
WHERE c.numero_contrato = 'CT-2026-001' AND s.nombre_servicio = 'Corte de flor' AND e.email = 'campo3@agroservices.com';

-- ---------- Solicitudes de servicio del portal ----------
INSERT INTO solicitud_servicio (id_cliente, id_servicio, fecha_deseada, ubicacion, descripcion, estado)
SELECT c.id_cliente, s.id_servicio, DATE_ADD(CURDATE(), INTERVAL 7 DAY), 'Bloque 9', 'Fumigacion preventiva antes de la temporada de lluvias', 'Pendiente'
FROM cliente c, servicio s WHERE c.documento = '900789456-2' AND s.nombre_servicio = 'Fumigacion';

-- ---------- Equipos en reparacion ----------
INSERT INTO equipo (codigo_seguimiento, id_cliente, id_tecnico, tipo_equipo, marca, modelo, serial, problema_reportado, diagnostico, valor_cotizacion, cotizacion_aprobada, estado, fecha_recepcion)
SELECT 'RX7K2M9P', c.id_cliente, e.id_empleado, 'Computador de escritorio', 'Lenovo', 'ThinkCentre M70', 'MJ0DK8PL', 'No enciende y huele a quemado',
       'Fuente de poder averiada; disco en buen estado', 285000, 1, 'En proceso', TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 3 DAY), '09:15:00')
FROM cliente c, empleado e WHERE c.documento = '900789456-2' AND e.email = 'tecnico@agroservices.com';

INSERT INTO equipo (codigo_seguimiento, id_cliente, id_tecnico, tipo_equipo, marca, modelo, serial, problema_reportado, estado, fecha_recepcion)
SELECT 'T4N8WQ2D', c.id_cliente, e.id_empleado, 'Portatil', 'HP', 'ProBook 440 G8', '5CD1234XYZ', 'Lentitud extrema al iniciar', 'Recibido', TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 1 DAY), '14:40:00')
FROM cliente c, empleado e WHERE c.documento = '79845123' AND e.email = 'tecnico@agroservices.com';

INSERT INTO equipo (codigo_seguimiento, id_cliente, id_tecnico, tipo_equipo, marca, modelo, serial, problema_reportado, diagnostico, valor_cotizacion, cotizacion_aprobada, estado, fecha_recepcion, fecha_entrega)
SELECT 'K9P3H6VB', c.id_cliente, e.id_empleado, 'Impresora termica', 'Zebra', 'ZD421', 'ZB99887766', 'No imprime etiquetas de poscosecha',
       'Cabezal sucio y sensor desalineado', 90000, 1, 'Entregado', TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 12 DAY), '10:00:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 9 DAY), '16:30:00')
FROM cliente c, empleado e WHERE c.documento = '900456123-1' AND e.email = 'tecnico@agroservices.com';

INSERT INTO repuesto_equipo (id_equipo, id_inventario, cantidad, costo_unitario)
SELECT q.id_equipo, i.id_inventario, 1, i.precio_unitario FROM equipo q, inventario i
WHERE q.codigo_seguimiento = 'RX7K2M9P' AND i.codigo_producto = 'REP-003';

-- ---------- Movimientos de inventario de ejemplo ----------
INSERT INTO movimiento_inventario (id_inventario, tipo, cantidad, referencia, id_empleado)
SELECT i.id_inventario, 'Consumo', 1, 'Equipo RX7K2M9P', e.id_empleado FROM inventario i, empleado e
WHERE i.codigo_producto = 'REP-003' AND e.email = 'tecnico@agroservices.com';
INSERT INTO movimiento_inventario (id_inventario, tipo, cantidad, referencia, id_empleado)
SELECT i.id_inventario, 'Ingreso', 20, 'Factura de compra 4518', e.id_empleado FROM inventario i, empleado e
WHERE i.codigo_producto = 'INS-001' AND e.email = 'inventario@agroservices.com';

-- ---------- Orden de compra pendiente ----------
INSERT INTO orden_compra (numero_orden, id_inventario, cantidad, valor_estimado, estado, automatica, id_solicitante)
SELECT 'OC-2026-0001', i.id_inventario, 6, 6 * i.precio_unitario, 'Pendiente', 1, e.id_empleado FROM inventario i, empleado e
WHERE i.codigo_producto = 'REP-002' AND e.email = 'inventario@agroservices.com';

-- ---------- Asistencia de los ultimos dias ----------
INSERT INTO asistencia (id_empleado, fecha, hora_entrada, hora_salida, metodo)
SELECT id_empleado, DATE_SUB(CURDATE(), INTERVAL 2 DAY), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 2 DAY), '06:52:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 2 DAY), '15:30:00'), 'QR'
FROM empleado WHERE email IN ('campo@agroservices.com', 'campo2@agroservices.com', 'campo3@agroservices.com', 'supervisor@agroservices.com');
INSERT INTO asistencia (id_empleado, fecha, hora_entrada, hora_salida, metodo)
SELECT id_empleado, DATE_SUB(CURDATE(), INTERVAL 1 DAY), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 1 DAY), '06:55:00'), TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 1 DAY), '15:25:00'), 'QR'
FROM empleado WHERE email IN ('campo@agroservices.com', 'campo2@agroservices.com', 'supervisor@agroservices.com');
INSERT INTO asistencia (id_empleado, fecha, hora_entrada, metodo)
SELECT id_empleado, CURDATE(), TIMESTAMP(CURDATE(), '06:58:00'), 'QR'
FROM empleado WHERE email IN ('campo2@agroservices.com', 'supervisor@agroservices.com');

-- ---------- Tareas ----------
INSERT INTO tarea (id_empleado, id_supervisor, titulo, descripcion, fecha_inicio, fecha_limite, prioridad, estado)
SELECT e.id_empleado, s.id_empleado, 'Revisar riego del bloque 4', 'Verificar goteros obstruidos antes del desbotone', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'Alta', 'Pendiente'
FROM empleado e, empleado s WHERE e.email = 'campo@agroservices.com' AND s.email = 'supervisor@agroservices.com';
INSERT INTO tarea (id_empleado, id_supervisor, titulo, descripcion, fecha_inicio, fecha_limite, prioridad, estado, fecha_completada)
SELECT e.id_empleado, s.id_empleado, 'Inventario de tijeras de poda', 'Contar y reportar tijeras en mal estado', DATE_SUB(CURDATE(), INTERVAL 5 DAY), DATE_SUB(CURDATE(), INTERVAL 3 DAY), 'Media', 'Completada', TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 4 DAY), '14:00:00')
FROM empleado e, empleado s WHERE e.email = 'campo2@agroservices.com' AND s.email = 'supervisor@agroservices.com';
INSERT INTO tarea (id_empleado, id_supervisor, titulo, descripcion, fecha_inicio, fecha_limite, prioridad, estado)
SELECT e.id_empleado, s.id_empleado, 'Limpieza de bodega de agroquimicos', 'Ordenar y rotular los recipientes', DATE_SUB(CURDATE(), INTERVAL 4 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'Baja', 'En proceso'
FROM empleado e, empleado s WHERE e.email = 'campo3@agroservices.com' AND s.email = 'supervisor@agroservices.com';

-- ---------- Seguridad y salud en el trabajo ----------
INSERT INTO capacitacion_sst (tema, descripcion, fecha_capacitacion, hora_inicio, hora_fin, ubicacion, instructor, estado) VALUES
  ('Manejo seguro de agroquimicos', 'Lectura de etiquetas, mezcla, aplicacion y disposicion de envases', DATE_SUB(CURDATE(), INTERVAL 15 DAY), '14:00:00', '16:00:00', 'Sala de reuniones', 'Paola Medina', 'Realizada'),
  ('Uso y cuidado de elementos de proteccion personal', 'Seleccion, ajuste, limpieza y reposicion de EPP', DATE_ADD(CURDATE(), INTERVAL 5 DAY), '14:00:00', '15:30:00', 'Sala de reuniones', 'Paola Medina', 'Programada');

INSERT INTO participante_capacitacion (id_capacitacion, id_empleado, asistio, certificado)
SELECT c.id_capacitacion, e.id_empleado, 1, CONCAT('CERT-', c.id_capacitacion, '-', e.id_empleado)
FROM capacitacion_sst c, empleado e
WHERE c.tema = 'Manejo seguro de agroquimicos' AND e.rol = 'Trabajador de Campo';
INSERT INTO participante_capacitacion (id_capacitacion, id_empleado, asistio)
SELECT c.id_capacitacion, e.id_empleado, 0
FROM capacitacion_sst c, empleado e
WHERE c.tema = 'Uso y cuidado de elementos de proteccion personal' AND e.rol IN ('Trabajador de Campo', 'Supervisor');

INSERT INTO entrega_epp (id_empleado, id_inventario, elemento, cantidad, fecha_entrega, fecha_reposicion, observaciones, id_responsable)
SELECT e.id_empleado, i.id_inventario, i.nombre_producto, 1, DATE_SUB(CURDATE(), INTERVAL 20 DAY), DATE_ADD(CURDATE(), INTERVAL 70 DAY), 'Entrega por ingreso a labores de fumigacion', r.id_empleado
FROM empleado e, inventario i, empleado r WHERE e.email = 'campo3@agroservices.com' AND i.codigo_producto = 'EPP-002' AND r.email = 'sst@agroservices.com';
INSERT INTO entrega_epp (id_empleado, id_inventario, elemento, cantidad, fecha_entrega, fecha_reposicion, observaciones, id_responsable)
SELECT e.id_empleado, i.id_inventario, i.nombre_producto, 2, DATE_SUB(CURDATE(), INTERVAL 10 DAY), DATE_ADD(CURDATE(), INTERVAL 20 DAY), 'Reposicion mensual', r.id_empleado
FROM empleado e, inventario i, empleado r WHERE e.email = 'campo@agroservices.com' AND i.codigo_producto = 'EPP-001' AND r.email = 'sst@agroservices.com';

INSERT INTO incidente (tipo, fecha_evento, lugar, id_empleado, descripcion, gravedad, dias_incapacidad, causas, acciones_correctivas, estado, reportado_arl)
SELECT 'Accidente', TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 18 DAY), '10:20:00'), 'Bloque 5', id_empleado,
       'Herida superficial en la mano izquierda con tijera de poda durante el corte', 'Leve', 2,
       'Tijera sin mantenimiento y ausencia de guante de corte', 'Mantenimiento quincenal de tijeras y dotacion de guantes anticorte', 'Cerrado', 1
FROM empleado WHERE email = 'campo2@agroservices.com';
INSERT INTO incidente (tipo, fecha_evento, lugar, id_empleado, descripcion, gravedad, dias_incapacidad, causas, estado)
SELECT 'Incidente', TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 3 DAY), '08:05:00'), 'Bodega de agroquimicos', id_empleado,
       'Derrame menor de fungicida al trasvasar sin embudo; no hubo contacto con la piel', 'Leve', 0,
       'Falta de embudo y bandeja de contencion', 'En seguimiento'
FROM empleado WHERE email = 'campo3@agroservices.com';

-- ---------- Facturacion ----------
INSERT INTO factura (numero_factura, id_cliente, id_contrato, fecha_emision, fecha_vencimiento, subtotal, porcentaje_iva, impuesto_iva, total, saldo, estado, forma_pago)
SELECT 'FV-2026-0001', c.id_cliente, k.id_contrato, DATE_SUB(CURDATE(), INTERVAL 40 DAY), DATE_SUB(CURDATE(), INTERVAL 10 DAY), 3186000, 19, 605340, 3791340, 1291340, 'Pagada parcialmente', 'Credito 30 dias'
FROM cliente c, contrato k WHERE c.documento = '900456123-1' AND k.numero_contrato = 'CT-2026-001';
INSERT INTO detalle_factura (id_factura, descripcion, cantidad, valor_unitario, subtotal, id_servicio)
SELECT f.id_factura, 'Desbotone bloques 1 a 4 (horas)', 120, 18000, 2160000, s.id_servicio FROM factura f, servicio s WHERE f.numero_factura = 'FV-2026-0001' AND s.nombre_servicio = 'Desbotone';
INSERT INTO detalle_factura (id_factura, descripcion, cantidad, valor_unitario, subtotal, id_servicio)
SELECT f.id_factura, 'Corte de flor bloque 5 (horas)', 54, 19000, 1026000, s.id_servicio FROM factura f, servicio s WHERE f.numero_factura = 'FV-2026-0001' AND s.nombre_servicio = 'Corte de flor';
INSERT INTO pago (id_factura, fecha_pago, valor, medio_pago, referencia)
SELECT id_factura, DATE_SUB(CURDATE(), INTERVAL 15 DAY), 2500000, 'Transferencia', 'TRF-889201' FROM factura WHERE numero_factura = 'FV-2026-0001';

INSERT INTO factura (numero_factura, id_cliente, id_contrato, fecha_emision, fecha_vencimiento, subtotal, porcentaje_iva, impuesto_iva, total, saldo, estado, forma_pago)
SELECT 'FV-2026-0002', c.id_cliente, k.id_contrato, DATE_SUB(CURDATE(), INTERVAL 8 DAY), DATE_ADD(CURDATE(), INTERVAL 22 DAY), 470000, 19, 89300, 559300, 559300, 'Pendiente', 'Credito 30 dias'
FROM cliente c, contrato k WHERE c.documento = '900789456-2' AND k.numero_contrato = 'CT-2026-002';
INSERT INTO detalle_factura (id_factura, descripcion, cantidad, valor_unitario, subtotal, id_servicio)
SELECT f.id_factura, 'Fumigacion bloques 1 y 2', 2, 95000, 190000, s.id_servicio FROM factura f, servicio s WHERE f.numero_factura = 'FV-2026-0002' AND s.nombre_servicio = 'Fumigacion';
INSERT INTO detalle_factura (id_factura, descripcion, cantidad, valor_unitario, subtotal, id_servicio)
SELECT f.id_factura, 'Reparacion de computador con cambio de fuente', 1, 280000, 280000, s.id_servicio FROM factura f, servicio s WHERE f.numero_factura = 'FV-2026-0002' AND s.nombre_servicio = 'Reparacion de computador';

INSERT INTO auditoria (tipo_usuario, accion, entidad, detalle) VALUES ('sistema', 'CARGA', 'demo', 'Carga inicial de datos de demostracion');
