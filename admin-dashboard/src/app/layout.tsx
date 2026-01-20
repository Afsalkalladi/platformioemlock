import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ESP32 RFID Admin",
  description: "Admin dashboard for ESP32 RFID door lock system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}
