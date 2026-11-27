import Link from "next/link";

import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { requireUser } from "@/lib/auth";

import { NavPills } from "./NavPills";

const STAFF = ["admin", "manager"] as const;

function Brand() {
  return (
    <Link href="/home" className="flex items-center gap-2 font-bold">
      <span aria-hidden="true" className="inline-block size-6 rounded-lg bg-primary" />
      Sejuk Sejuk
    </Link>
  );
}

/** Rendered while the session is read; same height so nothing jumps. */
export function StaffTopBarFallback() {
  return (
    <header className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 border-b bg-card px-4 py-3 md:px-6">
      <Brand />
    </header>
  );
}

export async function StaffTopBar() {
  const user = await requireUser(STAFF);
  return (
    <header className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 border-b bg-card px-4 py-3 md:px-6">
      <Brand />
      <NavPills />
      <form action="/orders" method="get" role="search" className="ml-auto">
        <label htmlFor="topbar-search" className="sr-only">
          Search orders
        </label>
        <input
          id="topbar-search"
          name="q"
          type="search"
          placeholder="Search order, name, phone"
          className="h-9 w-56 rounded-full border border-input bg-background px-4 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </form>
      <div className="flex items-center gap-3">
        {user.role === "admin" && (
          <Button asChild className="rounded-full">
            <Link href="/orders/new">+ New order</Link>
          </Button>
        )}
        <span className="hidden text-sm text-muted-foreground lg:inline">
          {user.fullName} · <span className="capitalize">{user.role}</span>
        </span>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm" className="rounded-full">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
