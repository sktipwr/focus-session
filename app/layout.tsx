import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Focus Session",
  description: "4-hour focus timer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
