import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida standalone: la imagen Docker final solo necesita `.next/standalone`
  // (server.js + el subconjunto de node_modules que el build rastreo con
  // @vercel/nft), sin copiar node_modules completo ni devDependencies.
  // Recomendacion oficial de Next.js para contenedores (ver
  // node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md).
  output: "standalone",
};

export default nextConfig;
