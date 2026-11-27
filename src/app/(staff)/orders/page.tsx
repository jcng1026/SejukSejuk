import type { Metadata } from "next";
import { Suspense } from "react";

import { parseOrderFilters } from "@/features/orders/filters";
import { OrdersTable } from "@/features/orders/OrdersTable";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Orders · Sejuk Sejuk Ops" };

async function Orders({ searchParams }: { searchParams: PageProps<"/orders">["searchParams"] }) {
  await requireUser(["admin", "manager"]);
  const filters = parseOrderFilters(await searchParams);
  return <OrdersTable filters={filters} />;
}

export default function OrdersPage({ searchParams }: PageProps<"/orders">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Orders</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading orders…</p>}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
