import { Suspense } from "react";

import { StaffTopBar, StaffTopBarFallback } from "@/features/shell/StaffTopBar";

export default function StaffLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense fallback={<StaffTopBarFallback />}>
        <StaffTopBar />
      </Suspense>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
