import { Router } from 'express';
import auth from './routes.auth.js';
import empleado from './routes.empleado.js';
import administrativo from './routes.administrativo.js';
import labor from './routes.labor.js';

/**
 * Rutas de la API agrupadas por modulo del sistema.
 */
const router = Router();
router.use(auth);            // Autenticacion y perfil (CU3.7, RF04)
router.use(empleado);        // Modulo 3: usuarios del sistema (RF03)
router.use(administrativo);  // Modulo 3: clientes, contratos, servicios, respaldo
router.use(labor);           // Modulo 1: servicios agricolas
export default router;
