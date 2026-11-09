import type { Metadata } from "next";
import "./matrix.css";

export const metadata: Metadata = {
  title: "Matrix | Closed beta",
  description: "The Matrix closed beta. Sign in with Discord to access the beta.",
  robots: { index: false, follow: false },
  icons: { icon: "/matrix-mark.svg" },
  referrer: "same-origin",
};

export default function MatrixLayout({ children }: LayoutProps<"/matrix">) {
  return (
    <html lang="en" className="matrix-document">
      <body>{children}</body>
    </html>
  );
}
