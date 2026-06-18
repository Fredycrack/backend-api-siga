# Backend API - Modulo de Empleados y Autenticacion (SIGA)

API REST construida con **Node.js + Express + MySQL + JWT** para el **Sistema Integrado
de Gestion AGROSERVICES (SIGA)** de AGROSERVICES P&D SAS.

Este servicio implementa el modulo de **administracion de empleados** (usuarios del
sistema) y la **autenticacion** mediante token JWT. Corresponde a la entidad `EMPLEADO`
del MER y a los requerimientos **RF03** (configurar usuarios con roles), **RF04**
(cambiar contrasena) y al caso de uso **CU3.7 Gestionar Autenticacion**.

## Estructura

```
backend-api/
├── app/
│   ├── config/
│   │   └── db.js                      # Pool de conexiones MySQL
│   ├── controllers/
│   │   ├── controller.auth.js         # Login / autenticacion (CU3.7)
│   │   └── controller.empleado.js     # Logica del CRUD de empleados
│   ├── models/
│   │   └── empleado.model.js          # Capa de acceso a datos (entidad EMPLEADO)
│   ├── middleware/
│   │   └── auth.middleware.js         # Verificacion del token JWT
│   └── routes/
│       ├── routes.auth.js             # Ruta de login
│       └── routes.empleado.js         # Rutas del CRUD (protegidas)
├── database/
│   └── schema.sql                     # Script para crear la BD y la tabla empleado
├── index.js                           # Punto de entrada
└── package.json
```

## Instalacion

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Crear la base de datos (ejecutar el contenido de `database/schema.sql` en MySQL).
3. Verificar las credenciales en `app/config/db.js` (host, user, password, database).
4. Levantar el servidor:
   ```bash
   npm run dev
   ```
   Servidor en: http://localhost:3000

## Autenticacion

Primero se obtiene un token con el login y luego se envia en el header
`Authorization: Bearer <token>` en cada peticion al CRUD.

| Metodo | Ruta        | Descripcion                              |
|--------|-------------|------------------------------------------|
| POST   | /api/login  | Autentica por email y devuelve el token  |

Credenciales de ejemplo: `admin@agroservices.com` / `1234`

## Endpoints del CRUD (requieren token)

| Metodo | Ruta                 | Descripcion                  |
|--------|----------------------|------------------------------|
| GET    | /api/empleados       | Listar todos los empleados   |
| GET    | /api/empleados/:id   | Obtener un empleado          |
| POST   | /api/empleados       | Crear empleado               |
| PUT    | /api/empleados/:id   | Actualizar empleado          |
| DELETE | /api/empleados/:id   | Eliminar empleado            |

## Nota tecnica

Para mantener el alcance de la practica, las contrasenas se almacenan en texto plano.
En un entorno real deberian cifrarse con **bcrypt** (RNF06) antes de guardarse.
