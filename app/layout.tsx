import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lanches na UFAL — onde comer e quanto custa",
  description:
    "Mapa dos pontos de venda de alimentação do Campus A.C. Simões (UFAL), com preços coletados pelos alunos.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
