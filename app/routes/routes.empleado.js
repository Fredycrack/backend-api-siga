import { Router } from 'express';
import {
  listarEmpleados, obtenerEmpleado, crearEmpleado, actualizarEmpleado, eliminarEmpleado,
  restablecerPassword, codigoQR
} from '../controllers/controller.empleado.js';
import { verificarToken, permitir, soloEmpleados } from '../middleware/auth.middleware.js';

const router = Router();
const consultan = permitir('Supervisor', 'Gerente', 'Responsable SST', 'Jefe de Inventario');

// Todas las rutas estan protegidas con verificarToken (JWT); la escritura es del Administrador (RF03)
router.get('/empleados', verificarToken, consultan, listarEmpleados);
router.get('/empleados/:id', verificarToken, consultan, obtenerEmpleado);
router.post('/empleados', verificarToken, permitir(), crearEmpleado);
router.put('/empleados/:id', verificarToken, permitir(), actualizarEmpleado);
router.delete('/empleados/:id', verificarToken, permitir(), eliminarEmpleado);
router.put('/empleados/:id/password', verificarToken, permitir(), restablecerPassword);
router.get('/empleados/:id/qr', verificarToken, soloEmpleados, codigoQR);

export default router;
