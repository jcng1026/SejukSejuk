// Shrinks large photos in the browser before upload: field connections are slow
// and the free storage tier is small. Anything else is returned unchanged.

const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIN_BYTES_TO_COMPRESS = 1.5 * 1024 * 1024;
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.8;

export async function compressImage(file: File): Promise<File> {
  if (!COMPRESSIBLE.has(file.type) || file.size < MIN_BYTES_TO_COMPRESS) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // Unsupported image (e.g. an unusual codec): upload the original instead.
    return file;
  }
}
