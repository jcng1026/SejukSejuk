import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { createOrder, expectErrorCode, signInAs, userId } from "./helpers";

let admin: SupabaseClient;
let ali: SupabaseClient;
let john: SupabaseClient;

beforeAll(async () => {
  [admin, ali, john] = await Promise.all([signInAs("aisyah"), signInAs("ali"), signInAs("john")]);
});

const PNG = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });

async function upload(client: SupabaseClient, orderId: string, name = "photo.png"): Promise<string> {
  const path = `orders/${orderId}/${crypto.randomUUID()}-${name}`;
  const { error } = await client.storage
    .from("job-files")
    .upload(path, PNG, { contentType: "image/png" });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return path;
}

function register(client: SupabaseClient, orderId: string, path: string) {
  return client.rpc("register_attachment", { p_order_id: orderId, p_storage_path: path });
}

describe("register_attachment", () => {
  it("records a file the assigned technician uploaded to the job's folder", async () => {
    const { id } = await createOrder(admin, { p_technician_id: userId("ali") });
    const path = await upload(ali, id);
    const { data, error } = await register(ali, id, path).single<{ id: string }>();
    expect(error).toBeNull();

    const { data: rows } = await admin
      .from("attachments")
      .select("storage_path, uploaded_by")
      .eq("id", data!.id);
    expect(rows).toEqual([{ storage_path: path, uploaded_by: userId("ali") }]);
  });

  it("hides other technicians' jobs", async () => {
    const { id } = await createOrder(admin, { p_technician_id: userId("ali") });
    const path = await upload(ali, id);
    expectErrorCode((await register(john, id, path)).error, "NOT_FOUND");
  });

  it("rejects a path outside this order's folder, or a file that was never uploaded", async () => {
    const mine = await createOrder(admin, { p_technician_id: userId("ali") });
    const other = await createOrder(admin, { p_technician_id: userId("ali") });
    const elsewhere = await upload(ali, other.id);
    expectErrorCode((await register(ali, mine.id, elsewhere)).error, "VALIDATION");
    expectErrorCode(
      (await register(ali, mine.id, `orders/${mine.id}/never-uploaded.png`)).error,
      "VALIDATION",
    );
  });

  it("takes type and size from Storage, not from the browser", async () => {
    const { id } = await createOrder(admin, { p_technician_id: userId("ali") });
    const { data } = await register(ali, id, await upload(ali, id)).single<{ id: string }>();
    const { data: rows } = await admin.from("attachments").select("mime, size_bytes").eq("id", data!.id);
    expect(rows).toEqual([{ mime: "image/png", size_bytes: 8 }]);
  });

  it("rejects a photo over 10 MB even though the bucket accepted it", async () => {
    const { id } = await createOrder(admin, { p_technician_id: userId("ali") });
    const big = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: "image/png" });
    const path = `orders/${id}/${crypto.randomUUID()}-big.png`;
    expect((await ali.storage.from("job-files").upload(path, big, { contentType: "image/png" })).error).toBeNull();
    expectErrorCode((await register(ali, id, path)).error, "VALIDATION");
  });

  it("caps how many objects a job folder can hold, so failed uploads cannot pile up", async () => {
    const { id } = await createOrder(admin, { p_technician_id: userId("ali") });
    for (let i = 0; i < 12; i += 1) await upload(ali, id, `x${i}.png`);
    const extra = await ali.storage
      .from("job-files")
      .upload(`orders/${id}/one-too-many.png`, PNG, { contentType: "image/png" });
    expect(extra.error).not.toBeNull();
  });

  it("refuses a payment receipt path that was never uploaded", async () => {
    const { id } = await createOrder(admin, { p_technician_id: userId("ali") });
    expect((await ali.rpc("start_job", { p_order_id: id })).error).toBeNull();
    const { error } = await ali.rpc("complete_job", {
      p_order_id: id,
      p_work_done: "Done",
      p_extra_sen: 0,
      p_payment_amount_sen: 100,
      p_payment_method: "cash",
      p_payment_receipt_path: `orders/${id}/made-up.jpg`,
    });
    expectErrorCode(error, "VALIDATION");
  });

  it("allows at most six files per job", async () => {
    const { id } = await createOrder(admin, { p_technician_id: userId("ali") });
    for (let i = 0; i < 6; i += 1) {
      expect((await register(ali, id, await upload(ali, id, `p${i}.png`))).error).toBeNull();
    }
    expectErrorCode((await register(ali, id, await upload(ali, id, "p7.png"))).error, "CONFLICT");
  });

  it("refuses uploads once the job is done", async () => {
    const { id } = await createOrder(admin, { p_technician_id: userId("ali") });
    const path = await upload(ali, id);
    expect((await ali.rpc("start_job", { p_order_id: id })).error).toBeNull();
    expect(
      (await ali.rpc("complete_job", { p_order_id: id, p_work_done: "Done", p_extra_sen: 0 }))
        .error,
    ).toBeNull();
    expectErrorCode((await register(ali, id, path)).error, "INVALID_TRANSITION");
  });
});
