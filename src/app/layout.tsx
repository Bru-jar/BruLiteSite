import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./matrix.css";
import { CodeRain } from "@/components/code-rain";
import { SiteFooter } from "@/components/footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Matrix — Mobile Assistance for Old School RuneScape",
    template: "%s — Matrix",
  },
  description:
    "Matrix is a mobile assistance tool for Old School RuneScape. Join the Matrix Discord for launch updates.",
  robots: { index: false, follow: false },
  referrer: "same-origin",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="relative isolate min-h-full flex flex-col bg-background text-foreground">
        <CodeRain />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
