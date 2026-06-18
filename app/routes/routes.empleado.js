import { Router } from 'express';
import {
  listarEmpleados,
  obtenerEmpleado,
  crearEmpleado,
  actualizarEmpleado,
  eliminarEmpleado
} from '../controllers/controller.empleado.js';
import { verificarToken } from '../middleware/auth.middleware.js';

const router = Router();

// Todas las rutas del CRUD estan protegidas con verificarToken (JWT)
router.get('/empleados', verificarToken, listarEmpleados);
router.get('/empleados/:id', verificarToken, obtenerEmpleado);
router.post('/empleados', verificarToken, crearEmpleado);
router.put('/empleados/:id', verificarToken, actualizarEmpleado);
router.delete('/empleados/:id', verificarToken, eliminarEmpleado);

export default router;
