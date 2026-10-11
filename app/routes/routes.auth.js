import { Router } from 'express';
import { login, loginCliente, perfil, cambiarPassword } from '../controllers/controller.auth.js';
import { codigoQR } from '../controllers/controller.empleado.js';
import { verificarToken, soloEmpleados } from '../middleware/auth.middleware.js';

const router = Router();

// CU3.7 - Gestionar Autenticacion
router.post('/login', login);
router.post('/portal/login', loginCliente);

// Perfil del usuario autenticado y RF04 - Cambiar contrasena
router.get('/perfil', verificarToken, perfil);
router.put('/perfil/password', verificarToken, cambiarPassword);
router.get('/perfil/qr', verificarToken, soloEmpleados, codigoQR);

export default router;
