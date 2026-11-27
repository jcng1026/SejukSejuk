import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { TechTabs } from "@/features/jobs/TechTabs";

function TechHeader() {
  return (
    <header className="flex items-center justify-between border-b bg-card px-4 py-3">
      <span className="flex items-center gap-2 font-bold">
        <span aria-hidden="true" className="inline-block size-6 rounded-lg bg-primary" />
        Sejuk Sejuk
      </span>
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm" className="rounded-full">
          Sign out
        </Button>
      </form>
    </header>
  );
}

export default function TechLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background">
      <TechHeader />
      <main className="flex flex-1 flex-col gap-4 px-4 py-4">
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>{children}</Suspense>
      </main>
      {/* usePathname reads the URL, which Cache Components requires inside Suspense. */}
      <Suspense fallback={<div className="h-16 border-t bg-card" />}>
        <TechTabs />
      </Suspense>
    </div>
  );
}
