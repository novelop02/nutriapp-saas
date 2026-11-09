# ADR-002: Estructura por módulo (rutas, controlador y servicio)

Estado: Aceptado
Fecha: 2026-11-09

## Contexto

El endpoint de registro cabía en tres líneas dentro del archivo de rutas. Al
implementar el login, el mismo handler pasó a encargarse de cosas de HTTP
(fijar una cookie httpOnly, cabeceras de caché, códigos de estado) además de
la lógica de negocio (verificar la contraseña, comparar contra un hash falso
para no revelar qué emails existen). Mezclar ambas cosas en un solo archivo
dificulta probar la lógica sin levantar Express y deja el código difícil de
leer a medida que crecen los módulos (pacientes, mediciones, comidas).

## Decisión

Cada módulo de la API vive en su propia carpeta y se divide en tres capas:

```
apps/api/src/
├── modules/
│   └── auth/
│       ├── auth.routes.ts       cablea: URL + middleware -> controlador
│       ├── auth.controller.ts   traduce HTTP: lee req, escribe res y cookies
│       └── auth.service.ts      lógica de negocio y acceso a datos
├── middleware/                  validate, requireAuth, manejo de errores
├── lib/                         utilidades sin HTTP (tokens, cookies)
├── db/                          esquema y cliente de Drizzle
└── errors.ts                    AppError
```

- **Rutas:** solo asocian método y URL con middleware y un controlador.
- **Controlador:** única capa que conoce `req` y `res`. Llama al servicio y
  decide el código de estado, las cookies y la forma de la respuesta.
- **Servicio:** recibe y devuelve datos simples. No importa Express. Lanza
  `AppError` para los errores de negocio (por ejemplo, `email_taken`).
- **Acceso a datos:** el servicio usa Drizzle directamente, sin una capa de
  repositorios aparte.
- **Regla para decidir dónde va algo:** si menciona `req`, `res` o una cookie,
  va en el controlador; si es una regla del negocio, va en el servicio.

## Alternativas consideradas

- **Dejar todo en el archivo de rutas:** es lo más corto al empezar, pero
  se vuelve inmanejable cuando el handler maneja cookies y reglas de negocio.
- **Carpetas por tipo en la raíz (`controllers/`, `services/`, `routes/`):**
  separa lo que cambia junto. Para tocar un módulo habría que abrir tres
  carpetas distintas.
- **Arquitectura hexagonal o con repositorios y casos de uso:** más
  desacoplada, pero con demasiada ceremonia para el tamaño actual del
  proyecto. Se reevaluará si el acceso a datos se complica.
- **NestJS:** impone una estructura similar, pero se prefiere menos
  abstracción mientras se aprende.

## Consecuencias

- Los servicios se prueban y se reutilizan sin Express, por ejemplo desde una
  Lambda en la fase de AWS.
- Cada módulo nuevo repite el mismo patrón, así que el código resulta
  predecible.
- Hay más archivos por módulo y algo de código de paso: un handler trivial
  igual necesita su controlador y su ruta.
- Al no haber capa de repositorios, el servicio queda acoplado a Drizzle. Es
  una deuda aceptada por ahora, y se revisará si hace falta cambiar de ORM o
  aislar las consultas.
- La regla del controlador y el servicio se revisa a mano en las revisiones de
  código. No hay una comprobación automática que impida que un servicio
  importe Express.
