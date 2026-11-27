import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { FlagChip } from "@/features/orders/badges";
import { formatSen } from "@/features/orders/money";
import { formatMytWhen } from "@/features/orders/schedule";
import {
  listReadyToClose,
  listReviewQueue,
  type ReviewItem,
  type ReviewList,
} from "@/features/review/queries";
import { CloseOrderButton, ReviewActions } from "@/features/review/ReviewActions";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Review · Sejuk Sejuk Ops" };

function ItemSummary({ item }: { item: ReviewItem }) {
  const isUnderpaid = item.paidSen < item.finalSen;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {item.topFlag && <FlagChip severity={item.topFlag} />}
        <Link
          href={`/orders/${item.id}`}
          className="font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          {item.orderNo}
        </Link>
        <span className="text-sm text-muted-foreground">
          {item.customerName}
          {item.technicianName ? ` · ${item.technicianName}` : ""}
        </span>
      </div>
      <p className="text-sm">
        Final {formatSen(item.finalSen)} · Paid{" "}
        <span className={isUnderpaid ? "font-semibold text-flag-high" : undefined}>
          {formatSen(item.paidSen)}
        </span>
      </p>
      <p className="text-xs text-muted-foreground">Completed {formatMytWhen(item.completedAt)}</p>
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="rounded-2xl border bg-card p-6 text-muted-foreground">{children}</p>;
}

function Shown({ list }: { list: ReviewList }) {
  if (list.items.length === list.total) return null;
  return (
    <p className="text-sm text-muted-foreground">
      Showing {list.items.length} of {list.total}.
    </p>
  );
}

const ROW = "flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4";

async function ReviewLists() {
  const user = await requireUser(["admin", "manager"]);
  const isManager = user.role === "manager";
  const [queueList, readyList] = await Promise.all([listReviewQueue(), listReadyToClose()]);
  const queue = queueList.items;
  const ready = readyList.items;
  return (
    <>
      <section aria-labelledby="queue-heading" className="flex flex-col gap-3">
        <h2 id="queue-heading" className="text-xl">
          Awaiting review ({queueList.total})
        </h2>
        {!isManager && (
          <p className="text-sm text-muted-foreground">Only managers can approve or send back.</p>
        )}
        <Shown list={queueList} />
        {queue.length === 0 ? (
          <Empty>No jobs waiting for review.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {queue.map((item) => (
              <li key={item.id} className={ROW}>
                <ItemSummary item={item} />
                {isManager && <ReviewActions orderId={item.id} orderNo={item.orderNo} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="close-heading" className="flex flex-col gap-3">
        <h2 id="close-heading" className="text-xl">
          Reviewed, ready to close ({readyList.total})
        </h2>
        <Shown list={readyList} />
        {ready.length === 0 ? (
          <Empty>Nothing waiting to be closed.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {ready.map((item) => (
              <li key={item.id} className={ROW}>
                <ItemSummary item={item} />
                {isManager && (
                  <CloseOrderButton
                    orderId={item.id}
                    orderNo={item.orderNo}
                    isUnderpaid={item.paidSen < item.finalSen}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function ReviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Review</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading the review queue…</p>}>
        <ReviewLists />
      </Suspense>
    </div>
  );
}
