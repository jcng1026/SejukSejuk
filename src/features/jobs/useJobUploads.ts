"use client";

import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import { registerAttachmentAction } from "./actions";
import { safeFileName, validateFile } from "./attachments";
import { compressImage } from "./compress";

export interface UploadItem {
  key: string;
  name: string;
  status: "uploading" | "done" | "error";
  error?: string;
  previewUrl?: string;
  file: File;
  /** Set once Storage has the file, so a retry only re-registers it. */
  uploadedPath?: string;
}

/** Compresses (photos), size-checks and uploads one file into the job's folder. */
export async function uploadToJobFolder(
  orderId: string,
  original: File,
  prefix = "",
): Promise<string> {
  const file = await compressImage(original);
  const problem = validateFile(file, 0);
  if (problem) throw new Error(problem);
  const path = `orders/${orderId}/${prefix}${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await createClient()
    .storage.from("job-files")
    .upload(path, file, { contentType: file.type });
  if (error) throw new Error("Upload failed. Check your connection and retry.");
  return path;
}

/** Uploads each file straight to Storage, then registers it; failed files can be retried or removed. */
export function useJobUploads(orderId: string, alreadyAttached: number) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const previews = useRef(new Set<string>());

  // Release preview object URLs when the form goes away.
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const update = (key: string, patch: Partial<UploadItem>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  async function send(item: UploadItem): Promise<void> {
    update(item.key, { status: "uploading", error: undefined });
    try {
      const path = item.uploadedPath ?? (await uploadToJobFolder(orderId, item.file));
      update(item.key, { uploadedPath: path });
      const result = await registerAttachmentAction(orderId, path);
      if (!result.ok) throw new Error(result.error.message);
      update(item.key, { status: "done" });
    } catch (error) {
      update(item.key, {
        status: "error",
        error: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  }

  /** Queues the chosen files; returns a message for any that were refused outright. */
  function add(files: FileList | null): string | null {
    if (!files) return null;
    let count = alreadyAttached + items.length;
    let rejection: string | null = null;
    const accepted: UploadItem[] = [];
    for (const file of Array.from(files)) {
      // Size is checked after compression, so only type and count here.
      const problem = validateFile({ type: file.type, size: 1 }, count);
      if (problem) {
        rejection = `${file.name}: ${problem}`;
        continue;
      }
      count += 1;
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      if (previewUrl) previews.current.add(previewUrl);
      accepted.push({
        key: crypto.randomUUID(),
        name: file.name,
        status: "uploading",
        file,
        previewUrl,
      });
    }
    setItems((current) => [...current, ...accepted]);
    accepted.forEach((item) => void send(item));
    return rejection;
  }

  function remove(item: UploadItem): void {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
      previews.current.delete(item.previewUrl);
    }
    setItems((current) => current.filter((other) => other.key !== item.key));
  }

  const uploading = items.filter((item) => item.status === "uploading").length;
  const failed = items.filter((item) => item.status === "error").length;
  const done = items.filter((item) => item.status === "done").length;
  const summary = [
    done && `${done} uploaded`,
    uploading && `${uploading} uploading`,
    failed && `${failed} failed`,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    items,
    add,
    remove,
    retry: (item: UploadItem) => void send(item),
    attachedCount: alreadyAttached + done,
    slotsUsed: alreadyAttached + items.length,
    isUploading: uploading > 0,
    hasFailures: failed > 0,
    summary,
  };
}
