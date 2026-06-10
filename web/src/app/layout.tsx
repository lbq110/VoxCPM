import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoxCPM Voice Chat",
  description: "Talk to an AI that replies in a natural VoxCPM voice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
