# Imagen de la app Next.js (App Router, Turbopack) para despliegue.
#
# Version de Node fijada igual que en .github/workflows/ci.yml
# (actions/setup-node@v4 con node-version: 24.19.0), para que la app se
# construya y corra con el mismo runtime que ya valida la integracion
# continua. Version de pnpm fijada igual que "packageManager" en
# package.json (pnpm@11.21.0), via corepack.
ARG NODE_VERSION=24.19.0-alpine
ARG PNPM_VERSION=11.21.0

# ─── Etapa 1: builder ───────────────────────────────────────────────────────
# Instala TODAS las dependencias (incluye devDependencies: hacen falta para
# `pnpm build`, que corre TypeScript/Turbopack) y compila. Esta etapa no
# llega a la imagen final.
FROM node:${NODE_VERSION} AS builder
ARG PNPM_VERSION
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Copiar solo los manifiestos primero para aprovechar la cache de capas de
# Docker: si no cambian package.json/pnpm-lock.yaml, `pnpm install` no se
# vuelve a ejecutar aunque cambie el codigo fuente despues.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# NEXT_PUBLIC_API_URL es publica por convencion de Next.js (viaja al bundle
# del navegador), pero eso mismo es la limitacion real: se HORNEA en el
# bundle en tiempo de build y ya no se puede cambiar en runtime sin
# reconstruir la imagen. Por eso se recibe aqui como ARG, sin valor por
# defecto: si falta, el build debe fallar de forma clara en vez de colar en
# silencio una URL de ejemplo que alguien podria confundir con la real.
# Se pasa con:  docker build --build-arg NEXT_PUBLIC_API_URL=https://api.ejemplo.com .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN test -n "$NEXT_PUBLIC_API_URL" || (echo "Falta --build-arg NEXT_PUBLIC_API_URL=<url-de-la-api> en el build" && exit 1)

# No se necesita telemetria de Next.js dentro de una imagen de CI/CD.
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# ─── Etapa 2: runtime ───────────────────────────────────────────────────────
# Imagen minima: sin pnpm, sin devDependencies, sin herramientas de
# compilacion. Solo lo que `output: "standalone"` traza como necesario para
# correr `node server.js` (ver next.config.ts).
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usuario/grupo dedicados con UID/GID fijos: la imagen final no corre como
# root.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs

# El modo standalone no copia `public` ni `.next/static` (Next.js recomienda
# servirlos aparte, p. ej. desde un CDN); como aqui no hay CDN, se copian a
# mano dentro de la carpeta standalone para que server.js los sirva.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
