"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// One series per chart, so one colour and no legend: the heading names it.
const SERIES = "var(--chart-1)";
const GRID = "var(--border)";
const TICK = { fill: "var(--muted-foreground)", fontSize: 12 };
const TOOLTIP_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 13,
};

// Text uses ink, never the series colour.
const TOOLTIP_TEXT = { color: "var(--foreground)" };

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  timeZone: "UTC",
});
const dayLabel = (day: string) => DAY_LABEL.format(new Date(`${day}T00:00:00Z`));

function ChartCard({
  title,
  labelHeading,
  table,
  children,
}: {
  title: string;
  labelHeading: string;
  table: { label: string; value: number }[];
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <h2 className="text-lg">{title}</h2>
      {table.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No jobs in this period.</p>
      ) : (
        // The chart is a picture of the table below, which screen readers use instead.
        <div className="h-64" aria-hidden="true">
          {children}
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 font-normal">{labelHeading}</th>
              <th className="py-1 text-right font-normal">Jobs</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row) => (
              <tr key={row.label} className="border-t">
                <td className="py-1">{row.label}</td>
                <td className="py-1 text-right tabular-nums">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

export function JobsPerDayChart({ data }: { data: { day: string; jobs: number }[] }) {
  const rows = data.map((row) => ({ label: dayLabel(row.day), value: row.jobs }));
  return (
    <ChartCard title="Jobs completed per day" labelHeading="Day" table={rows}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={TOOLTIP_STYLE}
            itemStyle={TOOLTIP_TEXT}
            labelStyle={TOOLTIP_TEXT}
            formatter={(value) => [value, "Jobs"]}
          />
          <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function ServiceMixChart({ data }: { data: { service: string; jobs: number }[] }) {
  const rows = data.map((row) => ({ label: row.service, value: row.jobs }));
  return (
    <ChartCard title="Jobs by service" labelHeading="Service" table={rows}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={TICK}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={TICK}
            tickLine={false}
            axisLine={{ stroke: GRID }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={TOOLTIP_STYLE}
            itemStyle={TOOLTIP_TEXT}
            labelStyle={TOOLTIP_TEXT}
            formatter={(value) => [value, "Jobs"]}
          />
          <Bar dataKey="value" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
