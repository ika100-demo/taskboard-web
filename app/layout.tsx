import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { SiteFooter } from "./_components/site-footer";
import { SiteHeader, type NavItem } from "./_components/site-header";
import "./globals.css";

const NAME = "taskboard-web";

export const metadata: Metadata = {
  title: { default: NAME, template: `%s · ${NAME}` },
  description: "Web UI for the taskboard system",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0c16" },
  ],
};

/** Header navigation: the operational endpoints every platform service exposes. */
const NAV: NavItem[] = [
  { href: "/api/health", label: "Health" },
  { href: "/api/ready", label: "Ready" },
  { href: "/api/metrics", label: "Metrics" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <SiteHeader name={NAME} links={NAV} />
        <main id="main-content" className="container">
          {children}
        </main>
        <SiteFooter name={NAME} />
      </body>
    </html>
  );
}
