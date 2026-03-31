import type { Metadata, Viewport } from "next";
import WaterOverlay from "./water-overlay";
import "./globals.css";

export const metadata: Metadata = {
  title: "Focusum",
  description: "Your daily non-negotiables — no excuses",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.ico", apple: "/icon-192.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Focusum",
  },
};

export const viewport: Viewport = {
  themeColor: "#090b10",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen">
        {children}
        <WaterOverlay />
      </body>
    </html>
  );
}
