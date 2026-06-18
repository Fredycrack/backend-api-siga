import { Router } from 'express';
import { login } from '../controllers/controller.auth.js';

const router = Router();

// CU3.7 - Gestionar Autenticacion
router.post('/login', login);

export default router;
