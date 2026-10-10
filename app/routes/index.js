import { Router } from 'express';
import auth from './routes.auth.js';
import empleado from './routes.empleado.js';
import administrativo from './routes.administrativo.js';
import labor from './routes.labor.js';
import equipo from './routes.equipo.js';
import inventario from './routes.inventario.js';
import personal from './routes.personal.js';
import sst from './routes.sst.js';
import factura from './routes.factura.js';

/**
 * Rutas de la API agrupadas por modulo del sistema.
 */
const router = Router();
router.use(auth);            // Autenticacion y perfil (CU3.7, RF04)
router.use(empleado);        // Modulo 3: usuarios del sistema (RF03)
router.use(administrativo);  // Modulo 3: clientes, contratos, servicios, respaldo
router.use(labor);           // Modulo 1: servicios agricolas
router.use(equipo);          // Modulo 2: servicios tecnologicos
router.use(personal);        // Modulo 4: gestion de personal
router.use(inventario);      // Modulo 5: inventario
router.use(sst);             // Modulo 6: seguridad y salud en el trabajo
router.use(factura);         // Modulo 7: facturacion
export default router;
