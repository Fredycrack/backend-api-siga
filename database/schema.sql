-- =====================================================================
-- Base de datos del Sistema Integrado de Gestion AGROSERVICES (SIGA)
-- Version 2.0: los ocho modulos del sistema
-- Compatible con MySQL 8, MariaDB 10.6+ y TiDB Cloud.
-- Todas las sentencias son idempotentes (IF NOT EXISTS): el script se
-- puede ejecutar sobre una base que ya tenga la version 1.0.
-- =====================================================================
CREATE DATABASE IF NOT EXISTS siga_db;
USE siga_db;

-- ---------------------------------------------------------------------
-- MODULO 3. GESTION ADMINISTRATIVA
-- ---------------------------------------------------------------------

-- Empleados: usuarios internos del sistema (RF03, RF04, CU3.7)
CREATE TABLE IF NOT EXISTS empleado (
  id_empleado    INT AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  documento      VARCHAR(20)  NOT NULL UNIQUE,
  email          VARCHAR(100) NOT NULL UNIQUE,
  telefono       VARCHAR(20),
  password       VARCHAR(255) NOT NULL,
  rol            ENUM('Administrador','Supervisor','Trabajador de Campo',
                      'Tecnico Electronico','Jefe de Inventario',
                      'Responsable SST','Gerente') NOT NULL DEFAULT 'Trabajador de Campo',
  salario_base   DECIMAL(12,2),
  codigo_qr      VARCHAR(50) UNIQUE,
  estado         ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo',
  fecha_ingreso  DATE,
  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clientes de la empresa (RF01); la contrasena habilita el portal de clientes
CREATE TABLE IF NOT EXISTS cliente (
  id_cliente     INT AUTO_INCREMENT PRIMARY KEY,
  nombre_cliente VARCHAR(150) NOT NULL,
  tipo_cliente   ENUM('Empresa floricultora','Empresa','Persona natural') NOT NULL DEFAULT 'Empresa floricultora',
  documento      VARCHAR(20)  NOT NULL UNIQUE,
  email          VARCHAR(100) NOT NULL UNIQUE,
  telefono       VARCHAR(20),
  direccion      VARCHAR(150),
  ciudad         VARCHAR(60),
  representante  VARCHAR(100),
  password       VARCHAR(255),
  estado         ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo',
  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contratos de servicios con los clientes (RF02)
CREATE TABLE IF NOT EXISTS contrato (
  id_contrato     INT AUTO_INCREMENT PRIMARY KEY,
  numero_contrato VARCHAR(30) NOT NULL UNIQUE,
  id_cliente      INT NOT NULL,
  tipo_contrato   ENUM('Labores agricolas','Servicios tecnologicos','Mixto') NOT NULL,
  descripcion     VARCHAR(500),
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE NOT NULL,
  valor_total     DECIMAL(14,2) NOT NULL DEFAULT 0,
  estado          ENUM('Vigente','Finalizado','Cancelado') NOT NULL DEFAULT 'Vigente',
  fecha_creacion  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_contrato_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente)
);

-- Catalogo de servicios agricolas y tecnologicos
CREATE TABLE IF NOT EXISTS servicio (
  id_servicio     INT AUTO_INCREMENT PRIMARY KEY,
  nombre_servicio VARCHAR(100) NOT NULL UNIQUE,
  tipo_servicio   ENUM('Agricola','Tecnologico') NOT NULL,
  descripcion     VARCHAR(300),
  unidad_medida   VARCHAR(30) NOT NULL DEFAULT 'Hora',
  tarifa_base     DECIMAL(12,2) NOT NULL DEFAULT 0,
  estado          ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo'
);

-- Solicitudes de servicio que registra el cliente desde el portal (RF06)
CREATE TABLE IF NOT EXISTS solicitud_servicio (
  id_solicitud   INT AUTO_INCREMENT PRIMARY KEY,
  id_cliente     INT NOT NULL,
  id_servicio    INT NOT NULL,
  fecha_deseada  DATE NOT NULL,
  ubicacion      VARCHAR(150),
  descripcion    VARCHAR(500),
  estado         ENUM('Pendiente','Aprobada','Rechazada') NOT NULL DEFAULT 'Pendiente',
  respuesta      VARCHAR(300),
  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_solicitud_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente),
  CONSTRAINT fk_solicitud_servicio FOREIGN KEY (id_servicio) REFERENCES servicio(id_servicio)
);

-- Registro de auditoria de las transacciones criticas (RNF07)
CREATE TABLE IF NOT EXISTS auditoria (
  id_auditoria INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario   INT,
  tipo_usuario ENUM('empleado','cliente','sistema') NOT NULL DEFAULT 'empleado',
  accion       VARCHAR(40)  NOT NULL,
  entidad      VARCHAR(40)  NOT NULL,
  id_registro  INT,
  detalle      VARCHAR(500),
  fecha        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- MODULO 1. SERVICIOS AGRICOLAS
-- ---------------------------------------------------------------------

-- Labores de cultivo programadas y ejecutadas (RF07 a RF12)
CREATE TABLE IF NOT EXISTS labor (
  id_labor        INT AUTO_INCREMENT PRIMARY KEY,
  id_contrato     INT NOT NULL,
  id_servicio     INT NOT NULL,
  id_empleado     INT NOT NULL,
  tipo_labor      VARCHAR(80) NOT NULL,
  descripcion     VARCHAR(500),
  ubicacion       VARCHAR(150) NOT NULL,
  latitud         DECIMAL(10,7),
  longitud        DECIMAL(10,7),
  fecha_programada DATE NOT NULL,
  hora_programada  TIME,
  cantidad        DECIMAL(10,2) NOT NULL DEFAULT 1,
  estado          ENUM('Programada','En proceso','Finalizada','Cancelada') NOT NULL DEFAULT 'Programada',
  hora_inicio     DATETIME,
  lat_inicio      DECIMAL(10,7),
  lon_inicio      DECIMAL(10,7),
  hora_fin        DATETIME,
  lat_fin         DECIMAL(10,7),
  lon_fin         DECIMAL(10,7),
  resultado       VARCHAR(500),
  porcentaje_cumplimiento INT,
  registrada_offline TINYINT(1) NOT NULL DEFAULT 0,
  id_factura      INT,
  fecha_creacion  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_labor_contrato FOREIGN KEY (id_contrato) REFERENCES contrato(id_contrato),
  CONSTRAINT fk_labor_servicio FOREIGN KEY (id_servicio) REFERENCES servicio(id_servicio),
  CONSTRAINT fk_labor_empleado FOREIGN KEY (id_empleado) REFERENCES empleado(id_empleado)
);

-- Evidencias fotograficas del avance de las labores (RF09)
CREATE TABLE IF NOT EXISTS evidencia_labor (
  id_evidencia  INT AUTO_INCREMENT PRIMARY KEY,
  id_labor      INT NOT NULL,
  imagen        MEDIUMTEXT NOT NULL,
  comentario    VARCHAR(300),
  latitud       DECIMAL(10,7),
  longitud      DECIMAL(10,7),
  fecha_captura DATETIME NOT NULL,
  CONSTRAINT fk_evidencia_labor FOREIGN KEY (id_labor) REFERENCES labor(id_labor) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- MODULO 5. INVENTARIO
-- ---------------------------------------------------------------------

-- Insumos agricolas, repuestos electronicos, herramientas y EPP (RF23 a RF25)
CREATE TABLE IF NOT EXISTS inventario (
  id_inventario      INT AUTO_INCREMENT PRIMARY KEY,
  codigo_producto    VARCHAR(30)  NOT NULL UNIQUE,
  nombre_producto    VARCHAR(120) NOT NULL,
  categoria          ENUM('Insumo agricola','Repuesto electronico','Herramienta','EPP') NOT NULL,
  unidad             VARCHAR(20)  NOT NULL DEFAULT 'Unidad',
  cantidad_disponible DECIMAL(12,2) NOT NULL DEFAULT 0,
  cantidad_minima    DECIMAL(12,2) NOT NULL DEFAULT 0,
  precio_unitario    DECIMAL(12,2) NOT NULL DEFAULT 0,
  proveedor          VARCHAR(100),
  ubicacion_almacen  VARCHAR(60),
  estado             ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo',
  fecha_ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Ingresos, consumos y ajustes de inventario (RF23, RF26)
CREATE TABLE IF NOT EXISTS movimiento_inventario (
  id_movimiento INT AUTO_INCREMENT PRIMARY KEY,
  id_inventario INT NOT NULL,
  tipo          ENUM('Ingreso','Consumo','Ajuste') NOT NULL,
  cantidad      DECIMAL(12,2) NOT NULL,
  referencia    VARCHAR(100),
  id_empleado   INT,
  fecha         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_movimiento_inventario FOREIGN KEY (id_inventario) REFERENCES inventario(id_inventario),
  CONSTRAINT fk_movimiento_empleado FOREIGN KEY (id_empleado) REFERENCES empleado(id_empleado)
);

-- Ordenes de compra generadas al llegar al stock minimo (RF27, RF28)
CREATE TABLE IF NOT EXISTS orden_compra (
  id_orden        INT AUTO_INCREMENT PRIMARY KEY,
  numero_orden    VARCHAR(30) NOT NULL UNIQUE,
  id_inventario   INT NOT NULL,
  cantidad        DECIMAL(12,2) NOT NULL,
  valor_estimado  DECIMAL(14,2) NOT NULL DEFAULT 0,
  estado          ENUM('Pendiente','Aprobada','Rechazada','Recibida') NOT NULL DEFAULT 'Pendiente',
  automatica      TINYINT(1) NOT NULL DEFAULT 1,
  id_solicitante  INT,
  id_aprobador    INT,
  observaciones   VARCHAR(300),
  fecha_creacion  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_aprobacion DATETIME,
  CONSTRAINT fk_orden_inventario FOREIGN KEY (id_inventario) REFERENCES inventario(id_inventario)
);

-- ---------------------------------------------------------------------
-- MODULO 2. SERVICIOS TECNOLOGICOS
-- ---------------------------------------------------------------------

-- Equipos electronicos recibidos para reparacion (RF13 a RF17)
CREATE TABLE IF NOT EXISTS equipo (
  id_equipo          INT AUTO_INCREMENT PRIMARY KEY,
  codigo_seguimiento VARCHAR(20)  NOT NULL UNIQUE,
  id_cliente         INT NOT NULL,
  id_tecnico         INT,
  tipo_equipo        VARCHAR(60)  NOT NULL,
  marca              VARCHAR(60),
  modelo             VARCHAR(60),
  serial             VARCHAR(60),
  problema_reportado VARCHAR(500) NOT NULL,
  diagnostico        VARCHAR(500),
  valor_cotizacion   DECIMAL(12,2),
  cotizacion_aprobada TINYINT(1) NOT NULL DEFAULT 0,
  estado             ENUM('Recibido','En diagnostico','En proceso','Completado','Entregado') NOT NULL DEFAULT 'Recibido',
  fecha_recepcion    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_entrega      DATETIME,
  CONSTRAINT fk_equipo_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente),
  CONSTRAINT fk_equipo_tecnico FOREIGN KEY (id_tecnico) REFERENCES empleado(id_empleado)
);

-- Repuestos utilizados en cada reparacion (RF15)
CREATE TABLE IF NOT EXISTS repuesto_equipo (
  id_repuesto    INT AUTO_INCREMENT PRIMARY KEY,
  id_equipo      INT NOT NULL,
  id_inventario  INT NOT NULL,
  cantidad       DECIMAL(12,2) NOT NULL,
  costo_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
  fecha          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_repuesto_equipo FOREIGN KEY (id_equipo) REFERENCES equipo(id_equipo) ON DELETE CASCADE,
  CONSTRAINT fk_repuesto_inventario FOREIGN KEY (id_inventario) REFERENCES inventario(id_inventario)
);

-- ---------------------------------------------------------------------
-- MODULO 4. GESTION DE PERSONAL
-- ---------------------------------------------------------------------

-- Registro de entrada y salida con codigo QR (RF19)
CREATE TABLE IF NOT EXISTS asistencia (
  id_asistencia INT AUTO_INCREMENT PRIMARY KEY,
  id_empleado   INT NOT NULL,
  fecha         DATE NOT NULL,
  hora_entrada  DATETIME NOT NULL,
  hora_salida   DATETIME,
  metodo        ENUM('QR','Manual') NOT NULL DEFAULT 'QR',
  CONSTRAINT fk_asistencia_empleado FOREIGN KEY (id_empleado) REFERENCES empleado(id_empleado)
);

-- Tareas asignadas por el supervisor (RF20, RF21)
CREATE TABLE IF NOT EXISTS tarea (
  id_tarea         INT AUTO_INCREMENT PRIMARY KEY,
  id_empleado      INT NOT NULL,
  id_supervisor    INT,
  titulo           VARCHAR(120) NOT NULL,
  descripcion      VARCHAR(500),
  fecha_inicio     DATE NOT NULL,
  fecha_limite     DATE NOT NULL,
  prioridad        ENUM('Alta','Media','Baja') NOT NULL DEFAULT 'Media',
  estado           ENUM('Pendiente','En proceso','Completada') NOT NULL DEFAULT 'Pendiente',
  fecha_completada DATETIME,
  CONSTRAINT fk_tarea_empleado FOREIGN KEY (id_empleado) REFERENCES empleado(id_empleado),
  CONSTRAINT fk_tarea_supervisor FOREIGN KEY (id_supervisor) REFERENCES empleado(id_empleado)
);

-- Liquidacion de nomina por periodo (RF22)
CREATE TABLE IF NOT EXISTS nomina (
  id_nomina          INT AUTO_INCREMENT PRIMARY KEY,
  id_empleado        INT NOT NULL,
  periodo_inicio     DATE NOT NULL,
  periodo_fin        DATE NOT NULL,
  dias_laborables    INT NOT NULL,
  dias_trabajados    INT NOT NULL,
  horas_trabajadas   DECIMAL(8,2) NOT NULL DEFAULT 0,
  salario_base       DECIMAL(12,2) NOT NULL DEFAULT 0,
  valor_dias         DECIMAL(12,2) NOT NULL DEFAULT 0,
  labores_finalizadas INT NOT NULL DEFAULT 0,
  tareas_completadas INT NOT NULL DEFAULT 0,
  bonificacion       DECIMAL(12,2) NOT NULL DEFAULT 0,
  deducciones        DECIMAL(12,2) NOT NULL DEFAULT 0,
  total              DECIMAL(12,2) NOT NULL DEFAULT 0,
  fecha_generacion   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_nomina_periodo (id_empleado, periodo_inicio, periodo_fin),
  CONSTRAINT fk_nomina_empleado FOREIGN KEY (id_empleado) REFERENCES empleado(id_empleado)
);

-- ---------------------------------------------------------------------
-- MODULO 6. SEGURIDAD Y SALUD EN EL TRABAJO
-- ---------------------------------------------------------------------

-- Capacitaciones en seguridad laboral (RF29)
CREATE TABLE IF NOT EXISTS capacitacion_sst (
  id_capacitacion    INT AUTO_INCREMENT PRIMARY KEY,
  tema               VARCHAR(150) NOT NULL,
  descripcion        VARCHAR(500),
  fecha_capacitacion DATE NOT NULL,
  hora_inicio        TIME,
  hora_fin           TIME,
  ubicacion          VARCHAR(100),
  instructor         VARCHAR(100),
  estado             ENUM('Programada','Realizada','Cancelada') NOT NULL DEFAULT 'Programada',
  fecha_registro     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Participantes de cada capacitacion (relacion participa del MER)
CREATE TABLE IF NOT EXISTS participante_capacitacion (
  id_participante INT AUTO_INCREMENT PRIMARY KEY,
  id_capacitacion INT NOT NULL,
  id_empleado     INT NOT NULL,
  asistio         TINYINT(1) NOT NULL DEFAULT 0,
  certificado     VARCHAR(60),
  UNIQUE KEY uq_participante (id_capacitacion, id_empleado),
  CONSTRAINT fk_participante_capacitacion FOREIGN KEY (id_capacitacion) REFERENCES capacitacion_sst(id_capacitacion) ON DELETE CASCADE,
  CONSTRAINT fk_participante_empleado FOREIGN KEY (id_empleado) REFERENCES empleado(id_empleado)
);

-- Entregas de elementos de proteccion personal (RF30)
CREATE TABLE IF NOT EXISTS entrega_epp (
  id_entrega       INT AUTO_INCREMENT PRIMARY KEY,
  id_empleado      INT NOT NULL,
  id_inventario    INT,
  elemento         VARCHAR(100) NOT NULL,
  cantidad         INT NOT NULL DEFAULT 1,
  fecha_entrega    DATE NOT NULL,
  fecha_reposicion DATE,
  observaciones    VARCHAR(300),
  id_responsable   INT,
  CONSTRAINT fk_epp_empleado FOREIGN KEY (id_empleado) REFERENCES empleado(id_empleado),
  CONSTRAINT fk_epp_inventario FOREIGN KEY (id_inventario) REFERENCES inventario(id_inventario)
);

-- Incidentes y accidentes laborales con seguimiento (RF31)
CREATE TABLE IF NOT EXISTS incidente (
  id_incidente         INT AUTO_INCREMENT PRIMARY KEY,
  tipo                 ENUM('Incidente','Accidente') NOT NULL,
  fecha_evento         DATETIME NOT NULL,
  lugar                VARCHAR(150) NOT NULL,
  id_empleado          INT,
  descripcion          VARCHAR(800) NOT NULL,
  gravedad             ENUM('Leve','Moderado','Grave','Mortal') NOT NULL DEFAULT 'Leve',
  dias_incapacidad     INT NOT NULL DEFAULT 0,
  causas               VARCHAR(500),
  acciones_correctivas VARCHAR(500),
  estado               ENUM('Abierto','En seguimiento','Cerrado') NOT NULL DEFAULT 'Abierto',
  reportado_arl        TINYINT(1) NOT NULL DEFAULT 0,
  fecha_registro       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_incidente_empleado FOREIGN KEY (id_empleado) REFERENCES empleado(id_empleado)
);

-- ---------------------------------------------------------------------
-- MODULO 7. FACTURACION
-- ---------------------------------------------------------------------

-- Facturas de servicios prestados (RF33, RF34, RF36)
CREATE TABLE IF NOT EXISTS factura (
  id_factura        INT AUTO_INCREMENT PRIMARY KEY,
  numero_factura    VARCHAR(30) NOT NULL UNIQUE,
  id_cliente        INT NOT NULL,
  id_contrato       INT,
  fecha_emision     DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  subtotal          DECIMAL(14,2) NOT NULL DEFAULT 0,
  porcentaje_iva    DECIMAL(5,2)  NOT NULL DEFAULT 19,
  impuesto_iva      DECIMAL(14,2) NOT NULL DEFAULT 0,
  total             DECIMAL(14,2) NOT NULL DEFAULT 0,
  saldo             DECIMAL(14,2) NOT NULL DEFAULT 0,
  estado            ENUM('Pendiente','Pagada parcialmente','Pagada','Anulada') NOT NULL DEFAULT 'Pendiente',
  forma_pago        ENUM('Contado','Credito 30 dias','Credito 60 dias') NOT NULL DEFAULT 'Credito 30 dias',
  observaciones     VARCHAR(300),
  enviada           TINYINT(1) NOT NULL DEFAULT 0,
  fecha_envio       DATETIME,
  fecha_creacion    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_factura_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente),
  CONSTRAINT fk_factura_contrato FOREIGN KEY (id_contrato) REFERENCES contrato(id_contrato)
);

-- Items de cada factura
CREATE TABLE IF NOT EXISTS detalle_factura (
  id_detalle     INT AUTO_INCREMENT PRIMARY KEY,
  id_factura     INT NOT NULL,
  descripcion    VARCHAR(200) NOT NULL,
  cantidad       DECIMAL(10,2) NOT NULL DEFAULT 1,
  valor_unitario DECIMAL(12,2) NOT NULL,
  subtotal       DECIMAL(14,2) NOT NULL,
  id_servicio    INT,
  CONSTRAINT fk_detalle_factura FOREIGN KEY (id_factura) REFERENCES factura(id_factura) ON DELETE CASCADE,
  CONSTRAINT fk_detalle_servicio FOREIGN KEY (id_servicio) REFERENCES servicio(id_servicio)
);

-- Pagos recibidos y estado de cartera (RF35)
CREATE TABLE IF NOT EXISTS pago (
  id_pago     INT AUTO_INCREMENT PRIMARY KEY,
  id_factura  INT NOT NULL,
  fecha_pago  DATE NOT NULL,
  valor       DECIMAL(14,2) NOT NULL,
  medio_pago  ENUM('Efectivo','Transferencia','Consignacion','Cheque') NOT NULL DEFAULT 'Transferencia',
  referencia  VARCHAR(60),
  id_empleado INT,
  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pago_factura FOREIGN KEY (id_factura) REFERENCES factura(id_factura)
);
