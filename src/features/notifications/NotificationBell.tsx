"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { formatMytWhen } from "@/features/orders/schedule";

import { markNotificationsReadAction } from "./actions";
import type { Notice } from "./notice";
import { useNotifications } from "./useNotifications";

/** Live bell for admins and managers (FR-NOT-3). */
export function NotificationBell({ userId }: { userId: string }) {
  const { notices, error, markAllRead } = useNotifications(userId);
  const [isOpen, setIsOpen] = useState(false);
  // The top bar wraps on narrow screens, so open the panel towards the side with room.
  const [opensRight, setOpensRight] = useState(false);
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const unread = notices.filter((notice) => notice.isUnread).length;
  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(isOpen, containerRef, close);

  function toggle() {
    const next = !isOpen;
    const left = containerRef.current?.getBoundingClientRect().left ?? 0;
    setOpensRight(left < window.innerWidth / 2);
    setIsOpen(next);
    if (!next || unread === 0) return;
    startTransition(async () => {
      if ((await markNotificationsReadAction()).ok) markAllRead();
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={isOpen}
        aria-controls="notification-panel"
        aria-label={`Notifications, ${unread} unread`}
        onClick={toggle}
        className="relative rounded-full"
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-flag-high px-1 text-[10px] leading-4 font-bold text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
      {isOpen && (
        <div
          id="notification-panel"
          className={`absolute ${opensRight ? "left-0" : "right-0"} z-50 mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-2xl border bg-card p-2 shadow-lg`}
        >
          <h2 className="px-2 py-1 text-sm font-semibold">Notifications</h2>
          <NoticeList notices={notices} error={error} onPick={close} />
        </div>
      )}
    </div>
  );
}

/** Closes the panel on Escape or a click outside it. */
function useDismiss(isOpen: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!isOpen) return;
    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, ref, close]);
}

function NoticeList({
  notices,
  error,
  onPick,
}: {
  notices: Notice[];
  error: string;
  onPick: () => void;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="px-2 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {notices.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">Nothing new.</p>
      ) : (
        <ul className="flex max-h-96 flex-col overflow-y-auto">
          {notices.map((notice) => (
            <li key={notice.id}>
              <Link
                href={notice.href}
                onClick={onPick}
                className="flex gap-2 rounded-xl px-2 py-2 text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${notice.isHigh ? "bg-flag-high" : "bg-status-job-done"}`}
                />
                <span className="flex flex-col">
                  <span className={notice.isUnread ? "font-semibold" : undefined}>
                    {notice.text}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatMytWhen(notice.createdAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
