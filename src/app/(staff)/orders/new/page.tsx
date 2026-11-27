import type { Metadata } from "next";
import { Suspense } from "react";

import { NewOrderForm } from "@/features/orders/NewOrderForm";
import { listServiceTypes, listTechnicians, technicianDayLoad } from "@/features/orders/queries";
import { mytDateFromToday } from "@/features/orders/schedule";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "New order · Sejuk Sejuk Ops" };

async function NewOrder() {
  await requireUser(["admin"]);
  const tomorrow = mytDateFromToday(1);
  const [serviceTypes, technicians, initialLoad] = await Promise.all([
    listServiceTypes(),
    listTechnicians(),
    technicianDayLoad(tomorrow),
  ]);
  return (
    <NewOrderForm
      serviceTypes={serviceTypes}
      technicians={technicians.filter((tech) => tech.isActive)}
      initialDate={tomorrow}
      initialLoad={initialLoad}
    />
  );
}

export default function NewOrderPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">New order</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading form…</p>}>
        <NewOrder />
      </Suspense>
    </div>
  );
}
