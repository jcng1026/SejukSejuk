import {
  ORDER_STATUSES,
  SEVERITY_CHIP,
  SEVERITY_DOT,
  SEVERITY_LABEL,
  STATUS_DOT,
  STATUS_LABEL,
  type FlagSeverity,
  type OrderStatus,
} from "./labels";

/** Colour key for every status plus the High-flag colour (schedule and calendar). */
export function StatusLegend() {
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {ORDER_STATUSES.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
          {STATUS_LABEL[status]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2 rounded-full bg-flag-high" />
        High flag
      </li>
    </ul>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-foreground">
      <span aria-hidden="true" className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function FlagChip({
  severity,
  children,
}: {
  severity: FlagSeverity;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${SEVERITY_CHIP[severity]}`}
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${SEVERITY_DOT[severity]}`} />
      {children ?? SEVERITY_LABEL[severity]}
    </span>
  );
}
