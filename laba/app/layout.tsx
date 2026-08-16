import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const sansFont = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const serifFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Adebisi Feranmi Portfolio",
  description: "Academic & Content Writer Portfolio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${sansFont.variable} ${serifFont.variable}`}>
        {children}
      </body>
    </html>
  );
}