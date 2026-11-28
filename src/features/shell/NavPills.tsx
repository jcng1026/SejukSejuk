"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/home", label: "Home" },
  { href: "/orders", label: "Orders" },
  { href: "/review", label: "Review" },
  { href: "/flags", label: "Flags" },
  { href: "/calendar", label: "Calendar" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/team", label: "Team" },
  { href: "/audit", label: "Audit" },
] as const;
/** FR-AI-8: only managers read the blocked AI request log. */
const MANAGER_LINKS = [{ href: "/ai-log", label: "AI log" }] as const;

export function NavPills({ isManager = false }: { isManager?: boolean }) {
  const pathname = usePathname();
  const links = isManager ? [...LINKS, ...MANAGER_LINKS] : LINKS;
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1 rounded-full bg-background p-1">
      {links.map((link) => {
        const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white"
                : "rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-sand hover:text-foreground"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
