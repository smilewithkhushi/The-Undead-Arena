import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Laser Garden Arena",
  description: "Event-driven tower defense prototype for Snowflake Buildathon 2026"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
