[![CI](https://github.com/LL18017/DocRecordFE/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/LL18017/DocRecordFE/actions/workflows/ci.yml)

This is a [Next.js](https://nextjs.org) project

## Getting Started
Build 
```bash
pnpm run build
```

First, run the development server:
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
---

## Requisitos para trabajar en local

La aplicación no funciona sola: necesita el backend y su base de datos.

| Servicio | Puerto | Cómo se levanta |
|---|---|---|
| PostgreSQL | 5432 | `docker compose up -d` en `DocRecordBE` |
| Backend | 8080 | `./mvnw spring-boot:run` en `DocRecordBE` |
| Frontend | 3000 | `pnpm dev` aquí |

La URL del backend se configura en `.env.local` (`NEXT_PUBLIC_API_URL`). Si la
base no corre en el 5432 por defecto, el backend admite `DB_PORT`.

## Pruebas

```bash
pnpm test         # unitarias y de componente (Vitest) — no necesitan backend
pnpm test:e2e     # end-to-end en navegador real (Playwright) — SÍ lo necesita
pnpm test:e2e:ui  # las mismas, con la interfaz de Playwright para depurar
```

### Antes de correr las e2e

**1. Backend levantado en `:8080`.** Las pruebas entran al sistema de verdad:
sin backend fallan todas en el login, y el mensaje no dice que el problema sea
ése.

**2. Credenciales en el entorno.** Copie `.env.e2e.example` a `.env.e2e` y
rellénelo. `.env.e2e` está ignorado por git a propósito: una contraseña
committeada sigue en el historial aunque después se borre del archivo.

```powershell
# Windows (PowerShell)
Get-Content .env.e2e | ForEach-Object { if ($_ -match '^(\w+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2]) } }
pnpm test:e2e
```

```bash
# Linux / macOS
set -a && . ./.env.e2e && set +a && pnpm test:e2e
```

**3. Las cuentas de prueba necesitan CLÍNICA ASIGNADA.** Es el requisito que más
confunde. Al entrar, el sistema lleva a la pantalla de selección de sede; una
cuenta sin ninguna clínica se queda ahí y la prueba falla por tiempo agotado,
sin decir por qué.

Se asignan desde **Usuarios y Roles → botón «Sedes»**, con una cuenta
administradora. Recuerde que `clinicas.user_id` es quien REGISTRÓ la clínica, no
quien trabaja en ella: por eso una enfermera nunca tiene sedes propias y hay que
asignárselas explícitamente.

**4. La cuenta de enfermería no debe tener también el rol de médico**, o las
pruebas negativas pasarían por el motivo equivocado: comprobarían que un médico
entra a `/consultas`, no que una enfermera no puede.

## Problemas conocidos

### La aplicación se cuelga sin error y una ruta no responde

Casi siempre es la caché de Turbopack corrupta. Pasa al reinstalar dependencias
con `pnpm dev` corriendo: el servidor sigue sirviendo trozos de la instalación
anterior. En el log aparece *«module factory is not available… stale browser
cache»* y la ruta afectada ni siquiera se registra.

```bash
# detener el servidor primero
rm -rf .next        # PowerShell: Remove-Item -Recurse -Force .next
pnpm dev
```

Solo afecta al modo desarrollo: `next build` parte de cero y no arrastra ese
estado.

### `pnpm install` deja `node_modules` roto en Windows

Si Node falla con `EPERM ... realpathSync` sobre un paquete, los enlaces de pnpm
se crearon como enlaces de *archivo* apuntando a carpetas. Reinstalar en modo
plano lo resuelve:

```bash
CI=true NPM_CONFIG_NODE_LINKER=hoisted pnpm install
```
