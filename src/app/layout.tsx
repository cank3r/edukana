import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Edukana — La educación evoluciona",
  description: "Plataforma integral para digitalizar instituciones educativas con inteligencia artificial.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
