import express from 'express';
import routeEmpleado from './app/routes/routes.empleado.js';
import routeAuth from './app/routes/routes.auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON
app.use(express.json());

// Ruta de prueba
// Ruta temporal para inicializar la base de datos en produccion (usar una sola vez)
import pool from './app/config/db.js';
app.get('/setup-db', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS empleado (
        id_empleado    INT AUTO_INCREMENT PRIMARY KEY,
        nombre         VARCHAR(100) NOT NULL,
        documento      VARCHAR(20)  NOT NULL UNIQUE,
        email          VARCHAR(100) NOT NULL UNIQUE,
        telefono       VARCHAR(20),
        password       VARCHAR(255) NOT NULL,
        rol            ENUM('Administrador','Supervisor','Trabajador de Campo','Tecnico Electronico','Jefe de Inventario','Responsable SST','Gerente') NOT NULL DEFAULT 'Trabajador de Campo',
        salario_base   DECIMAL(12,2),
        codigo_qr      VARCHAR(50) UNIQUE,
        estado         ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo',
        fecha_ingreso  DATE,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      INSERT IGNORE INTO empleado
        (id_empleado, nombre, documento, email, telefono, password, rol, salario_base, codigo_qr, fecha_ingreso) VALUES
        (1, 'Fredy Vargas',   '1012345678', 'admin@agroservices.com',      '3001112233', '1234', 'Administrador',       2500000.00, 'QR-EMP-001', '2025-01-15'),
        (2, 'Laura Martinez', '1023456789', 'supervisor@agroservices.com', '3004445566', '1234', 'Supervisor',          1800000.00, 'QR-EMP-002', '2025-02-01'),
        (3, 'Carlos Gomez',   '1034567890', 'campo@agroservices.com',      '3007778899', '1234', 'Trabajador de Campo', 1300000.00, 'QR-EMP-003', '2025-03-10')
    `);
    res.json({ message: 'Base de datos inicializada correctamente: tabla empleado creada con 3 registros' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rutas de autenticacion (login) - CU3.7 Gestionar Autenticacion
app.use('/api', routeAuth);

// Rutas del CRUD de empleados - CU3.3 Configurar Usuarios / RF03
app.use('/api', routeEmpleado);

app.listen(PORT, () => {
  console.log(`Servidor SIGA (backend) corriendo en el puerto ${PORT}`);
});