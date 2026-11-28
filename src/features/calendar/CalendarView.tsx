"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import type { EventClickInfo, EventInput, EventSourceFuncInfo } from "@fullcalendar/react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Label } from "@/components/ui/label";
import { StatusLegend } from "@/features/orders/badges";
import { SELECT_CLASS } from "@/features/orders/FormField";
import { STATUS_LABEL, type OrderStatus } from "@/features/orders/labels";

import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";

import type { Result } from "@/lib/result";

import type { CalendarJob } from "./types";

const JOB_MINUTES = 120;
const CARD_HEX = "#fffdf9";
const INK_HEX = "#1f2a2a";

// Status colour as a left bar, ink text on the card surface: readable for every status.
const STATUS_BAR: Record<OrderStatus, string> = {
  new: "!border-l-status-new",
  assigned: "!border-l-status-assigned",
  in_progress: "!border-l-status-in-progress",
  job_done: "!border-l-status-job-done",
  reviewed: "!border-l-status-reviewed",
  closed: "!border-l-status-closed",
};

function toEvent(job: CalendarJob): EventInput {
  const end = new Date(Date.parse(job.scheduledAt) + JOB_MINUTES * 60_000).toISOString();
  const flag = job.topFlag === "high" ? "⚑ " : "";
  return {
    id: job.id,
    title: `${flag}${job.customerName} · ${job.serviceType}${job.technicianName ? ` · ${job.technicianName}` : ""}`,
    start: job.scheduledAt,
    end,
    // FullCalendar derives text and fill from these, so they must be plain colours (palette C
    // surface and ink), not CSS variables.
    color: CARD_HEX,
    contrastColor: INK_HEX,
    className: `!border-l-4 ${job.topFlag === "high" ? "!border-l-flag-high" : STATUS_BAR[job.status]}`,
    extendedProps: { orderNo: job.orderNo, status: STATUS_LABEL[job.status] },
  };
}

/** Week and month calendar of scheduled jobs with a technician filter (FR-CAL-1). */
export function CalendarView({ technicians }: { technicians: { id: string; name: string }[] }) {
  const router = useRouter();
  const [technicianId, setTechnicianId] = useState("");
  const [error, setError] = useState("");

  // A new function identity makes FullCalendar refetch when the filter changes.
  const loadEvents = useCallback(
    async (info: EventSourceFuncInfo): Promise<EventInput[]> => {
      // A GET route, not a Server Action: FullCalendar fetches while it renders.
      const query = new URLSearchParams({
        start: info.start.toISOString(),
        end: info.end.toISOString(),
        technician: technicianId,
      });
      const result = await fetch(`/api/calendar?${query}`, { cache: "no-store" })
        .then((response) => response.json() as Promise<Result<CalendarJob[]>>)
        .catch((): Result<CalendarJob[]> => ({
          ok: false,
          error: { code: "INTERNAL", message: "Could not load the calendar. Try again." },
        }));
      if (!result.ok) {
        setError(result.error.message);
        return [];
      }
      setError("");
      return result.data.map(toEvent);
    },
    [technicianId],
  );

  function openOrder(info: EventClickInfo) {
    info.jsEvent.preventDefault();
    router.push(`/orders/${info.event.id}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-56 flex-col gap-1">
          <Label htmlFor="calendar-technician">Technician</Label>
          <select
            id="calendar-technician"
            value={technicianId}
            onChange={(event) => setTechnicianId(event.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Everyone</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.name}
              </option>
            ))}
          </select>
        </div>
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      </div>
      <StatusLegend />
      <div className="rounded-2xl border bg-card p-3">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, classicThemePlugin]}
          initialView="timeGridWeek"
          timeZone="Asia/Kuala_Lumpur"
          firstDay={1}
          headerToolbar={{
            start: "prev,next today",
            center: "title",
            end: "timeGridDay,timeGridWeek,dayGridMonth",
          }}
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          allDaySlot={false}
          height="auto"
          events={loadEvents}
          eventClick={openOrder}
        />
      </div>
    </div>
  );
}
