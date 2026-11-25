import type { Metadata } from "next";

import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: {
    default: "pinch/rust — a complete learning path",
    template: "%s · pinch/rust",
  },
  description:
    "Rust from first principles: 39 lessons on ownership, async and the ecosystem, six buildable projects, real-world use cases and runnable examples.",
  metadataBase: new URL("https://vkdev01.github.io/pinch-of-rust"),
  openGraph: {
    title: "pinch/rust",
    description:
      "A complete Rust learning path: lessons, projects, real-world use cases and runnable examples.",
    type: "website",
  },
};

// Runs before paint so a light-theme visitor never sees a dark flash.
const themeScript = `try{var t=localStorage.getItem('pr:theme');if(t==='light'){document.documentElement.classList.remove('dark');document.documentElement.dataset.theme='light'}}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <SiteHeader />
        <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
