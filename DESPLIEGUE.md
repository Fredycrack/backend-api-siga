# Guia de despliegue de SIGA 2.0 en Render y TiDB Cloud

El sistema se publica en tres piezas:

| Pieza | Servicio | Repositorio |
|---|---|---|
| Base de datos MySQL compatible | TiDB Cloud (plan gratuito Starter, antes Serverless) | — |
| API REST | Render, Web Service con Node | `backend-api-siga` |
| Interfaz web | Render, Web Service con Node | `frontend-ejs-siga` (carpeta `siga-frontend`) |

Las claves nunca se escriben en el codigo ni en este documento: se configuran como variables de
entorno en el panel de cada servicio.

## 1. Base de datos en TiDB Cloud

1. Ingrese a <https://tidbcloud.com> y cree un cluster del plan gratuito. Elija una region de AWS
   en Estados Unidos (la misma zona general en la que creara los servicios de Render).
2. En **SQL Editor** ejecute: `CREATE DATABASE siga_db;`
   *Si ya tiene la base de la version 1.0, no la borre: la API agrega las tablas nuevas y conserva
   los empleados existentes.*
3. En **Connect** elija la conexion general, genere la contrasena y copie host, puerto (4000) y usuario
   (tiene la forma `xxxxxxxx.root`).
4. Arme la cadena de conexion:
   ```
   mysql://USUARIO:CONTRASENA@HOST:4000/siga_db
   ```
   Si la contrasena tiene caracteres especiales (`@`, `:`, `/`, `#`), escribalos codificados
   (por ejemplo `@` como `%40`). No hace falta agregar parametros de TLS: la API activa la conexion
   cifrada automaticamente cuando el servidor es de TiDB Cloud.

## 2. API en Render

1. En <https://dashboard.render.com> elija **New > Web Service** y conecte el repositorio `backend-api-siga`.
2. Configure:
   - **Branch**: `main` (o `siga-v2` mientras se prueba la version 2.0)
   - **Runtime**: Node
   - **Build Command**: `npm ci --omit=dev`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/`
3. En **Environment** agregue:

   | Variable | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | la cadena del paso 1 |
   | `JWT_SECRET` | use **Generate** para crear una clave aleatoria |
   | `DEMO_PASSWORD` | clave de los usuarios de demostracion (8 o mas caracteres con mayuscula, minuscula y numero) |

4. Cree el servicio. En los registros (**Logs**) deben aparecer:
   `[SIGA] Datos de demostracion cargados`, `[SIGA] Base de datos lista` y
   `Servidor SIGA (backend) corriendo en el puerto ...`.
5. Abra la URL del servicio (por ejemplo `https://backend-api-siga.onrender.com/`): debe responder
   `{"message":"API SIGA - AGROSERVICES P&D SAS funcionando correctamente","version":"2.0.0"}`.

Alternativa: el archivo `render.yaml` permite crear el servicio como *Blueprint*
(**New > Blueprint**); Render pedira los valores marcados como `sync: false`.

## 3. Interfaz web en Render

1. **New > Web Service** con el repositorio `frontend-ejs-siga`.
2. Configure:
   - **Root Directory**: `siga-frontend`
   - **Build Command**: `npm ci --omit=dev`
   - **Start Command**: `npm start`
3. Variables de entorno:

   | Variable | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `API_URL` | URL de la API **terminada en `/api`**, por ejemplo `https://backend-api-siga.onrender.com/api` |
   | `SESSION_SECRET` | use **Generate** |

4. Abra la URL de la interfaz e ingrese con `admin@agroservices.com` y la clave de `DEMO_PASSWORD`.

## 4. Verificacion

- Ingrese con cada rol (ver el README de la API) y recorra su menu.
- En un celular, ingrese como trabajador de campo, abra **Mis labores**, active el modo avion,
  registre la finalizacion de una labor y desactive el modo avion: el registro se sincroniza solo.
  El GPS, la camara y el modo sin conexion requieren HTTPS, que Render ya provee.
- Consulte un equipo en `/seguimiento` con su codigo (por ejemplo `RX7K2M9P` en los datos de demostracion).
- Opcional: ejecute el recorrido automatico contra el sitio publicado desde un equipo con Node:
  `BASE_URL=https://su-frontend.onrender.com CLAVE_DEMO=... npm run e2e` (en una base recien creada).

## 5. Correo de facturas (opcional)

Para que el boton **Enviar por correo** funcione (RF34), agregue en la API las variables
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM` de una cuenta de correo con
contrasena de aplicacion. Sin ellas, el sistema informa que el envio no esta configurado.

## 6. Consideraciones del plan gratuito

- Render suspende los servicios gratuitos despues de un tiempo sin visitas; la primera peticion
  puede tardar cerca de un minuto. Antes de una demostracion abra primero la URL de la API y luego
  la de la interfaz.
- Cada `git push` a la rama configurada vuelve a desplegar el servicio automaticamente.

## 7. Solucion de problemas

| Sintoma | Causa probable |
|---|---|
| "No fue posible conectar con el servidor de la API" | `API_URL` incorrecta o la API esta suspendida; abra la URL de la API y espere |
| `Access denied for user` en los registros de la API | usuario o contrasena de TiDB incorrectos en `DATABASE_URL` |
| `Unknown database 'siga_db'` | falta el paso 1.2 |
| El inicio de sesion vuelve siempre a la pantalla de ingreso | el sitio se abrio por `http://` con `NODE_ENV=production` (la cookie de sesion solo viaja por `https://`) |
| Las fotos o el GPS no funcionan | el sitio debe abrirse por `https://` y el navegador debe tener los permisos de camara y ubicacion |

## Despliegue local con Docker

Con los dos repositorios clonados en la misma carpeta:

```bash
cd backend-api-siga
docker compose up -d --build
```

Abra `http://localhost:8080` (Apache, que entrega las peticiones a la interfaz web). La base de datos
no publica puertos y la API crea las tablas y los datos de demostracion al iniciar.
