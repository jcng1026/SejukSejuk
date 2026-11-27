import { Suspense } from "react";

import { SignedInAs } from "@/features/auth/SignedInAs";

const TECHNICIANS = ["technician"] as const;

export default function TechnicianHomePage() {
  return (
    <main className="p-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <SignedInAs allowed={TECHNICIANS} />
      </Suspense>
    </main>
  );
}
