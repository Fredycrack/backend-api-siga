-- Base de datos del Sistema Integrado de Gestion AGROSERVICES (SIGA)
CREATE DATABASE IF NOT EXISTS siga_db;
USE siga_db;

-- Tabla EMPLEADO (usuarios del sistema con rol y autenticacion)
-- Corresponde a la entidad EMPLEADO del MER y a los RF03, RF04 / CU3.7
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

-- Datos de ejemplo (para probar el login y el CRUD)
INSERT INTO empleado
  (nombre, documento, email, telefono, password, rol, salario_base, codigo_qr, fecha_ingreso) VALUES
  ('Fredy Vargas',   '1012345678', 'admin@agroservices.com',      '3001112233', '1234', 'Administrador',       2500000.00, 'QR-EMP-001', '2025-01-15'),
  ('Laura Martinez', '1023456789', 'supervisor@agroservices.com', '3004445566', '1234', 'Supervisor',          1800000.00, 'QR-EMP-002', '2025-02-01'),
  ('Carlos Gomez',   '1034567890', 'campo@agroservices.com',      '3007778899', '1234', 'Trabajador de Campo', 1300000.00, 'QR-EMP-003', '2025-03-10');
