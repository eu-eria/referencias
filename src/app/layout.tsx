import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastViewport } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Referências — seu banco pessoal de ideias",
  description:
    "Capture links, imagens e notas em segundos e encontre a referência certa na hora em que você precisa dela.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
  ],
};

/**
 * Aplica o tema salvo antes da primeira pintura. Sem isso, quem usa o tema
 * claro vê um flash escuro a cada carregamento, já que a preferência só é
 * lida do IndexedDB depois da hidratação.
 */
const THEME_BOOTSTRAP = `
(function () {
  try {
    var saved = localStorage.getItem('referencias:theme');
    var theme = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        {children}
        <ToastViewport />
      </body>
    </html>
  );
}
