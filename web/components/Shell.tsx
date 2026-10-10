"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { icons } from "./icons";

const NAV = [
  { href: "/", label: "Forecast", icon: icons.forecast },
  { href: "/ops", label: "Ops guidance", icon: icons.ops },
  { href: "/whatif", label: "What-if", icon: icons.whatif },
  { href: "/agent", label: "AI agents", icon: icons.agent },
  { href: "/trucks", label: "Truck log", icon: icons.log },
];

export function Rail() {
  const path = usePathname();
  return (
    <nav className="rail" aria-label="Main">
      <span className="logo">{icons.logo}</span>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined} aria-label={n.label}>
          {n.icon}
          <span className="tip">{n.label}</span>
        </Link>
      ))}
      <span className="spacer" />
    </nav>
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
