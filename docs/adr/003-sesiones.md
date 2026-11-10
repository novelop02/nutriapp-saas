# ADR-003: Diseño de sesiones

Estado: Aceptado
Fecha: 2026-11-10

## Contexto

La API maneja datos de salud, así que una sesión robada debe causar el menor
daño posible y poder cerrarse. Hace falta un esquema que funcione con un
frontend en el navegador y que se pueda revocar.

## Decisión

- **Access token:** JWT firmado (HS256) de 15 minutos con `sub`, `role`,
  `iss`, `aud` y `exp`, en una cookie httpOnly. El algoritmo se fija al
  verificar y los claims se validan con Zod.
- **Refresh token:** cadena aleatoria opaca de 32 bytes, no es un JWT. En la
  base de datos solo se guarda su hash SHA-256. Cookie httpOnly,
  SameSite=Strict y Path=/auth, de modo que solo viaja a los endpoints de auth.
- **Rotación:** cada refresh revoca el token usado y emite uno nuevo de la
  misma familia (`family_id`).
- **Detección de reutilización:** si reaparece un token ya rotado, se revoca
  toda la familia. Se hace dentro de una transacción con `SELECT ... FOR UPDATE`
  para que dos refrescos simultáneos no usen el mismo token.
- **Errores:** todos los fallos de refresh devuelven el mismo 401, sin
  distinguir entre token inexistente, vencido, revocado o reutilizado.
- **Logout:** `/auth/logout` revoca la familia actual y `/auth/logout-all`
  revoca todas las del usuario.

## Alternativas consideradas

- **Sesiones de servidor con un identificador:** más simples y revocables al
  instante, pero cada petición consulta el almacén de sesiones.
- **JWT de larga duración sin refresh:** no se pueden revocar.
- **Argon2 para el hash del refresh token:** innecesario, porque el token ya
  tiene 256 bits de entropía, y además hay que buscar por hash.
- **Clerk o Cognito:** descartadas porque el objetivo es aprender cómo
  funcionan las sesiones por dentro.

## Consecuencias

- Hay estado en la base de datos (tabla `refresh_tokens`) que crece y
  necesitará limpieza periódica.
- Tras `logout-all` los access tokens ya emitidos siguen valiendo hasta 15
  minutos, que es el costo de usar JWT sin estado.
- El frontend debe serializar los refrescos: dos pestañas refrescando a la vez
  provocan justo la detección de reutilización y cierran la sesión.
- La sesión se renueva indefinidamente mientras se use. No hay vida máxima
  absoluta, y podría añadirse.
- Se guardan el user-agent y la IP de cada sesión. La IP es un dato personal
  y su retención se decide en la fase de privacidad.
- Detrás del balanceador de AWS, `req.ip` mostrará la IP del balanceador
  mientras no se configure `trust proxy`.
