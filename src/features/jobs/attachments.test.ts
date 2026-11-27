import { describe, expect, it } from "vitest";

import { MAX_FILES, safeFileName, validateFile } from "./attachments";

const MB = 1024 * 1024;

describe("validateFile", () => {
  it("accepts photos and PDFs up to 10 MB and videos up to 50 MB", () => {
    expect(validateFile({ type: "image/jpeg", size: 10 * MB }, 0)).toBeNull();
    expect(validateFile({ type: "application/pdf", size: MB }, 0)).toBeNull();
    expect(validateFile({ type: "video/mp4", size: 50 * MB }, 0)).toBeNull();
  });

  it("explains what is wrong with a rejected file", () => {
    expect(validateFile({ type: "image/png", size: 10 * MB + 1 }, 0)).toMatch(/10 MB/);
    expect(validateFile({ type: "video/quicktime", size: 51 * MB }, 0)).toMatch(/50 MB/);
    expect(validateFile({ type: "application/zip", size: 1 }, 0)).toMatch(
      /photos, videos and PDFs/,
    );
    expect(validateFile({ type: "image/png", size: 0 }, 0)).toMatch(/empty/);
  });

  it("stops at six files per job", () => {
    expect(validateFile({ type: "image/png", size: 1 }, MAX_FILES - 1)).toBeNull();
    expect(validateFile({ type: "image/png", size: 1 }, MAX_FILES)).toMatch(/6 files/);
  });
});

describe("safeFileName", () => {
  it("keeps a readable name but nothing that could escape the folder", () => {
    expect(safeFileName("../../etc/passwd")).toBe("etcpasswd");
    expect(safeFileName("Outdoor unit (before).JPG")).toBe("Outdoor-unit-before.JPG");
    expect(safeFileName("")).toBe("file");
  });
});
