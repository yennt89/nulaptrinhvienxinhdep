import type { Metadata } from "next";
import { Be_Vietnam_Pro, Fraunces } from "next/font/google";
import "./globals.css";

const bodyFont = Be_Vietnam_Pro({
  variable: "--font-body",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "600", "700", "800"],
});

const displayFont = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700", "800"],
});

export const metadata: Metadata = {
  title: "NLTV Flashcards",
  description: "Học flashcard  English (mock JSON + MP3)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${bodyFont.variable} ${displayFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-[family-name:var(--font-body)]">
        {children}
      </body>
    </html>
  );
}
