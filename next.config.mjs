/** @type {import('next').NextConfig} */
const nextConfig = {
  // Site 100% estático: `next build` gera a pasta `out/`, que a Cloudflare publica.
  // (Não há API routes nem renderização no servidor; o Supabase é acessado direto do navegador.)
  output: "export",
};
export default nextConfig;
