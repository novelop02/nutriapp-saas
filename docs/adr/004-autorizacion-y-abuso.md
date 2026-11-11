# ADR-004: Autorización y protección contra abuso

Estado: Aceptado
Fecha: 2026-11-11

## Contexto

La API maneja datos de salud de pacientes de distintos nutriólogos. Tras la
autenticación (ADR-003), hace falta decidir quién puede hacer qué, y frenar el
abuso: fuerza bruta, creación masiva de cuentas, peticiones de otros sitios y
cuerpos enormes.

## Decisión

**Autorización**

- Roles con `requireRole`, siempre después de `requireAuth`. Si falta
  `requireAuth`, responde 401 (falla cerrado).
- Reglas de acceso a recursos en funciones puras (`canViewPatient`,
  `canManagePatient`), separando ver de modificar.
- 401 sin sesión; 403 cuando el rol no puede usar la ruta o cuando se ve el
  recurso pero no se puede modificar; 404 cuando el recurso no se puede ni ver.
- El admin no tiene acceso clínico por defecto.
- El rol viaja en el access token.

**Abuso**

- Rate limiting con Redis (contador atómico en Lua, ventana fija): login por IP
  y por IP + hash del email, registro por IP y refresh por IP. 429 con
  Retry-After, sin revelar el límite.
- Falla abierto si Redis no responde, con un log de error.
- CORS con lista blanca y credenciales, nunca `*`. Guardia de `Origin` en
  métodos que cambian estado como segunda barrera contra CSRF.
- Cabeceras con helmet, CSP restrictivo, `Cache-Control: no-store` y HSTS solo
  en producción. Límite de 10 KB en /auth y 100 KB en el resto.

**Observabilidad**

- Eventos de seguridad con nombres fijos en una constante, registrados con el
  id de la petición: authorization_denied, origin_rejected, rate_limited,
  rate_limit_store_error y refresh_token_reuse.

## Alternativas consideradas

- **RBAC en la base de datos (tablas de permisos):** más flexible, demasiado
  para tres roles fijos.
- **Comprobar el rol en la base de datos en cada petición:** cambios de rol
  inmediatos, a cambio de una consulta por petición.
- **Fallar cerrado sin Redis:** más seguro contra fuerza bruta, pero deja a
  todos sin login si Redis cae.
- **express-rate-limit:** listo para usar; se implementó a mano para entender
  la atomicidad y la caducidad de las claves.
- **Ventana deslizante:** evita ráfagas en el borde de la ventana; más compleja.

## Consecuencias

- Un cambio de rol tarda hasta 15 minutos en aplicarse.
- Nada obliga a proteger una ruta nueva: hay que acordarse de requireRole.
  Row Level Security (semana 20) será la segunda barrera.
- Detrás del balanceador de AWS hay que configurar `trust proxy`, o todos los
  usuarios compartirían una IP y un mismo límite.
- Con Redis caído no hay límites; requiere una alarma (semana 21).
- La lista de orígenes debe incluir el origen del frontend aunque se sirva por
  el mismo dominio, porque los navegadores envían Origin en los POST.
- Un ataque distribuido contra una cuenta desde muchas IPs no queda cubierto;
  se tratará con MFA o avisos al usuario.
