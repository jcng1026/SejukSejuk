"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/tech", label: "Today", icon: "M3 12h18M12 3v18" },
  { href: "/tech/upcoming", label: "Upcoming", icon: "M4 7h16M4 12h16M4 17h10" },
  {
    href: "/tech/history",
    label: "History",
    icon: "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  },
] as const;

/** Bottom tab bar for the technician's phone layout (mockup E). */
export function TechTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Jobs"
      className="sticky bottom-0 grid grid-cols-3 border-t bg-card pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
    >
      {TABS.map((tab) => {
        const isActive =
          tab.href === "/tech" ? pathname === "/tech" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-11 flex-col items-center justify-center gap-1 text-xs font-semibold ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d={tab.icon} />
            </svg>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
