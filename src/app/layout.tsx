import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Domma AvatarIA", description: "Domma Tecnologia — gêmeo digital com IA para propagandas, depoimentos e podcasts" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
