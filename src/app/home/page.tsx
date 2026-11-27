import { Suspense } from "react";

import { SignedInAs } from "@/features/auth/SignedInAs";

const STAFF = ["admin", "manager"] as const;

export default function StaffHomePage() {
  return (
    <main className="p-8">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <SignedInAs allowed={STAFF} />
      </Suspense>
    </main>
  );
}
