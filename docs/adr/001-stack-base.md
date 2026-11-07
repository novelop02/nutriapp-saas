# ADR-001: Stack base del proyecto

Estado: Aceptado
Fecha: 2026-11-07

## Contexto

NutriTrack es una aplicación web de seguimiento nutricional: los nutriólogos
registran el progreso de sus pacientes y los pacientes registran comidas,
comentarios y avances. Es un proyecto personal de portafolio con datos
ficticios, cuyo objetivo es practicar el desarrollo full stack en la nube:
autenticación y autorización, manejo seguro de archivos, procesamiento
asíncrono, contenedores, CI/CD e infraestructura como código.

Necesito un stack que ya domine en parte (TypeScript, React, Node, Postgres),
que me permita profundizar en seguridad y que sea habitual en el mercado.

## Decisión

- Monorepo con pnpm workspaces (backend, frontend y paquete compartido).
- TypeScript en modo estricto, fijado en 6.x porque typescript-eslint aún
  no soporta TypeScript 7.
- API con Node y Express.
- Zod como única fuente de verdad para validación y tipos, compartido entre
  backend y frontend.
- PostgreSQL con Drizzle como ORM, y Redis para caché y rate limiting.
- Autenticación propia: contraseñas con argon2, access token corto y refresh
  token rotativo, ambos en cookies httpOnly.
- Logs estructurados con pino.
- Commits convencionales, verificados con Husky y commitlint.
- Docker Compose para el entorno local.

## Alternativas consideradas

- **Clerk o Cognito para la autenticación:** descartadas porque el objetivo
  es entender cómo funcionan las sesiones y los tokens por dentro. En un
  producto real con usuarios reales habría que reconsiderarlo.
- **Prisma en lugar de Drizzle:** Drizzle usa migraciones en SQL y facilita
  el trabajo posterior con Row Level Security.
- **NestJS en lugar de Express:** prefiero menos abstracción mientras aprendo.
- **Repositorios separados para backend y frontend:** complicarían compartir
  los esquemas de Zod.

## Consecuencias

- Más trabajo propio y más responsabilidad en seguridad, porque no delego la
  autenticación en un tercero.
- Un solo repositorio simplifica compartir código, pero el CI crecerá con
  el proyecto.
- La versión de TypeScript se revisará cuando el tooling soporte la 7.x.
- Decisiones futuras (hosting, infraestructura como código, estrategia de
  despliegue) tendrán su propio ADR.
