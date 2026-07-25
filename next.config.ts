import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // As capas dos links são carregadas de qualquer domínio da web, então usamos
  // <img> puro em vez de next/image — nada de allowlist de domínios pra manter.
  reactStrictMode: true,
  // O driver do Postgres carrega bindings nativos opcionais; empacotá-lo quebra
  // a resolução. `node:sqlite` é builtin e nem entra no bundle.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
