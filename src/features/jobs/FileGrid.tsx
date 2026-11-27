"use client";

import { ACCEPTED_TYPES, MAX_FILES } from "./attachments";
import type { useJobUploads } from "./useJobUploads";

type Uploads = ReturnType<typeof useJobUploads>;

interface FileGridProps {
  uploads: Uploads;
  /** Why the last chosen files were refused, if any. */
  message: string;
  onMessage: (message: string) => void;
}

/** Up to six job files: preview tiles with per-file retry/remove, and an add tile. */
export function FileGrid({ uploads, message, onMessage }: FileGridProps) {
  const firstError = uploads.items.find((item) => item.status === "error")?.error;
  return (
    <section aria-labelledby="files-heading" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 id="files-heading" className="font-semibold">
          Photos, video, PDF
        </h3>
        <span className="text-sm text-muted-foreground">
          {uploads.attachedCount} / {MAX_FILES}
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {uploads.items.map((item) => (
          <li
            key={item.key}
            className="flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border bg-accent p-1 text-center text-xs"
          >
            {item.previewUrl && item.status === "done" ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
              <img src={item.previewUrl} alt={item.name} className="size-full object-cover" />
            ) : (
              <span className="line-clamp-2 break-all">{item.name}</span>
            )}
            {item.status === "uploading" && <span aria-hidden="true">Uploading…</span>}
            {item.status === "error" && (
              <span className="flex gap-1">
                <button
                  type="button"
                  className="min-h-11 rounded-full bg-card px-2 font-semibold text-primary"
                  onClick={() => uploads.retry(item)}
                  aria-label={`Retry ${item.name}`}
                >
                  Retry
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-full bg-card px-2 font-semibold text-destructive"
                  onClick={() => uploads.remove(item)}
                  aria-label={`Remove ${item.name}`}
                >
                  Remove
                </button>
              </span>
            )}
          </li>
        ))}
        {uploads.slotsUsed < MAX_FILES && (
          <li>
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-2xl text-muted-foreground focus-within:ring-3 focus-within:ring-ring/50">
              <span aria-hidden="true">+</span>
              <span className="text-xs">Add files</span>
              <input
                type="file"
                multiple
                accept={ACCEPTED_TYPES.join(",")}
                className="sr-only"
                aria-describedby="files-status"
                onChange={(event) => {
                  onMessage(uploads.add(event.target.files) ?? "");
                  event.target.value = "";
                }}
              />
            </label>
          </li>
        )}
      </ul>
      {/* One live region for all tiles, so progress is announced without noise. */}
      <p id="files-status" role="status" className="text-sm">
        {uploads.summary}
        {firstError && <span className="block text-destructive">{firstError}</span>}
        {message && <span className="block text-destructive">{message}</span>}
      </p>
    </section>
  );
}
