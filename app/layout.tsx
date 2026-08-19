import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ordem — Plataforma de Progresso",
  description: "Ambiente institucional e acadêmico da Escola Estadual Ordem e Progresso.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
