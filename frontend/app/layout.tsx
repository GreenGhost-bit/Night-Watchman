import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { SiteNav } from "@/components/SiteNav";

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-source-serif",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lamplighter — Operator Console",
  description:
    "Live liquidation-risk watchtower across Messari-standardized lending subgraphs, plus the policy-capped defense vault on Arc.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e7e9ec" },
    { media: "(prefers-color-scheme: dark)", color: "#14171b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${barlowCondensed.variable} ${sourceSerif.variable} ${plexMono.variable}`}
    >
      <body className="font-sans antialiased">
        <Providers>
          <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col">
            <SiteNav />
            <main className="flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-10">{children}</main>
            <footer className="border-t border-border px-4 py-4 text-xs text-ink-faint sm:px-6 lg:px-10">
              <p className="font-serif">
                Lamplighter — ETHOnline 2026. Watchtower data is read-only and sourced from
                public Messari-standardized subgraphs. The Demo Vault is a self-controlled fixture
                on Arc testnet, not a real user position.
              </p>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
