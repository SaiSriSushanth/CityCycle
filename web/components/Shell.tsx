"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { icons } from "./icons";

const NAV = [
  { href: "/", label: "Forecast", short: "Forecast", icon: icons.forecast, page: "forecast" },
  { href: "/ops", label: "Ops guidance", short: "Ops", icon: icons.ops, page: "ops" },
  { href: "/whatif", label: "What-if", short: "What-if", icon: icons.whatif, page: "whatif" },
  { href: "/agent", label: "AI agents", short: "Agents", icon: icons.agent, page: "agent" },
  { href: "/trucks", label: "Truck log", short: "Trucks", icon: icons.log, page: "trucks" },
];

/** Page frame: brand, navigation, and the page's own color (set through data-page). */
export function Chrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  const page = NAV.find((n) => n.href === path)?.page ?? "forecast";
  return (
    <div className="app" data-page={page}>
      <header className="site">
        <Link href="/" className="brand" aria-label="CityCycle home">
          {icons.brand}
          <span>CityCycle</span>
        </Link>
        <nav aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} data-page={n.page} aria-current={path === n.href ? "page" : undefined}>
              {n.icon}
              <span className="lbl-long">{n.label}</span>
              <span className="lbl-short">{n.short}</span>
            </Link>
          ))}
        </nav>
      </header>
      <main className="stage">{children}</main>
    </div>
  );
}

export function Topbar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="topbar">
      <h1>{title}</h1>
      {children}
    </header>
  );
}
