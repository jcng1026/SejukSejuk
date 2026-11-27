import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";

const STAFF = ["admin", "manager"] as const;

// Placeholder until Phase 4 builds the schedule bento home (mockup C2).
async function Greeting() {
  const user = await requireUser(STAFF);
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-3xl">Hi {user.fullName}</h1>
      <p className="text-muted-foreground">The schedule dashboard arrives in a later phase.</p>
      <div className="flex gap-2">
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/orders">View orders</Link>
        </Button>
        {user.role === "admin" && (
          <Button asChild className="rounded-full">
            <Link href="/orders/new">Create an order</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export default function StaffHomePage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Greeting />
    </Suspense>
  );
}
