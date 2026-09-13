"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WalletButton } from "@/components/WalletButton";

const LINKS = [
  { href: "/", label: "Watchtower" },
  { href: "/vault", label: "Demo Vault" },
  { href: "/activity", label: "Activity Log" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-sm border border-accent/60 bg-accent-soft/30 text-accent"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 2 3 6v6c0 5.25 3.75 9.74 9 11 5.25-1.26 9-5.75 9-11V6l-9-4Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M12 8v5m0 3.2h.01"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="leading-tight">
            <span className="block font-sans text-base font-semibold uppercase tracking-wide text-ink">
              Night Watchman
            </span>
            <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              Case File · ETHOnline 2026
            </span>
          </span>
        </Link>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`tracked-label whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-accent text-accent-fg"
                    : "text-ink-soft hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
