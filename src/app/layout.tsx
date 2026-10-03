import type { Metadata } from "next";
import { Outfit, Inter } from "next/font/google";
import { AppProvider } from "@/context/AppContext";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DocRecord Sv · Sistema de Gestión Clínica Ambulatoria",
  description: "Sistema clínico integral para médicos, enfermeras y clínicas ambulatorias en El Salvador.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${outfit.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-doc-surface text-slate-800">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
