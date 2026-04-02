import type { Metadata } from "next";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Telesearch",
  description: "ค้นหา Channel, Group และ Bot บน Telegram",
  applicationName: "Telesearch",
  openGraph: {
    title: "Telesearch",
    description: "ค้นหา Channel, Group และ Bot บน Telegram",
    siteName: "Telesearch",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="font-body antialiased min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <AppNav />
        {children}
      </body>
    </html>
  );
}
