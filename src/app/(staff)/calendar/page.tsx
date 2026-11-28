import type { Metadata } from "next";
import { Suspense } from "react";

import { CalendarView } from "@/features/calendar/CalendarView";
import { listTechnicians } from "@/features/orders/queries";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Calendar · Sejuk Sejuk Ops" };

async function Calendar() {
  await requireUser(["admin", "manager"]);
  const technicians = await listTechnicians();
  return (
    <CalendarView
      technicians={technicians.map((technician) => ({
        id: technician.id,
        name: technician.fullName,
      }))}
    />
  );
}

export default function CalendarPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl">Calendar</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading the calendar…</p>}>
        <Calendar />
      </Suspense>
    </div>
  );
}
