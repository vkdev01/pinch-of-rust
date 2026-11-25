import type {Metadata} from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Northwind Analytics - Revenue dashboard",
  description:
    "SaaS revenue, usage and billing dashboard built with Next.js App Router, Tailwind CSS v4 and HeroUI v3.",
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
