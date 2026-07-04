import express from 'express';
import routeEmpleado from './app/routes/routes.empleado.js';
import routeAuth from './app/routes/routes.auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON
app.use(express.json());

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: 'API SIGA - AGROSERVICES P&D SAS funcionando correctamente' });
});

// Rutas de autenticacion (login) - CU3.7 Gestionar Autenticacion
app.use('/api', routeAuth);

// Rutas del CRUD de empleados - CU3.3 Configurar Usuarios / RF03
app.use('/api', routeEmpleado);

app.listen(PORT, () => {
  console.log(`Servidor SIGA (backend) corriendo en el puerto ${PORT}`);
});