// Client-side mirror of register_attachment's rules, so a bad file is refused
// before it is uploaded. The database checks the same rules again.

export const MAX_FILES = 6;
const MB = 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * MB;
const MAX_VIDEO_BYTES = 50 * MB;

export const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
] as const;

/** Returns a user-facing reason the file can't be attached, or null if it can. */
export function validateFile(
  file: { type: string; size: number },
  alreadyAttached: number,
): string | null {
  if (alreadyAttached >= MAX_FILES) return `A job can have at most ${MAX_FILES} files.`;
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return "Only photos, videos and PDFs can be attached.";
  }
  if (file.size <= 0) return "That file is empty.";
  const isVideo = file.type.startsWith("video/");
  if (file.size > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
    return isVideo ? "Videos can be up to 50 MB." : "Photos and PDFs can be up to 10 MB.";
  }
  return null;
}

/** A storage-safe version of a file name: no slashes, dot-dots or odd characters. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9.\s-]/g, "")
    .replace(/\.{2,}/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return cleaned || "file";
}
