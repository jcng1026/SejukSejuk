import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { DEMO_PASSWORD } from "@/features/auth/demo-password";

import { anonClient, createOrder, signInAs, userId } from "./helpers";

let admin: SupabaseClient;
let manager: SupabaseClient;
let ali: SupabaseClient;
let john: SupabaseClient;

beforeAll(async () => {
  [admin, manager, ali, john] = await Promise.all([
    signInAs("aisyah"),
    signInAs("rahman"),
    signInAs("ali"),
    signInAs("john"),
  ]);
});

describe("order visibility", () => {
  it("technicians see only orders assigned to them; admins and managers see all", async () => {
    const forAli = await createOrder(admin, { p_technician_id: userId("ali") });
    const forJohn = await createOrder(admin, { p_technician_id: userId("john") });
    const ids = [forAli.id, forJohn.id];

    const visible = async (client: SupabaseClient) =>
      ((await client.from("orders").select("id").in("id", ids)).data ?? []).map((r) => r.id).sort();

    expect(await visible(ali)).toEqual([forAli.id]);
    expect(await visible(john)).toEqual([forJohn.id]);
    expect(await visible(admin)).toEqual([...ids].sort());
    expect(await visible(manager)).toEqual([...ids].sort());
  });

  it("a technician loses access to an order once it is reassigned away", async () => {
    const order = await createOrder(admin, { p_technician_id: userId("ali") });
    await admin.rpc("assign_order", {
      p_order_id: order.id,
      p_technician_id: userId("john"),
      p_reason: "Rebalancing load",
    });
    const { data } = await ali.from("orders").select("id").eq("id", order.id);
    expect(data).toEqual([]);
  });

  it("anonymous callers cannot execute any workflow RPC at all", async () => {
    const { error } = await anonClient().rpc("create_order", {
      p_customer_name: "x",
      p_customer_phone: "60123456789",
      p_customer_address: "x",
      p_problem_description: "x",
      p_service_type_id: 1,
      p_quoted_sen: 1,
      p_scheduled_at: new Date().toISOString(),
    });
    // Permission denied by grants (42501), not merely refused by the role check inside.
    expect(error?.code).toBe("42501");
  });

  it("anonymous visitors see nothing", async () => {
    const { data, error } = await anonClient().from("orders").select("id").limit(1);
    expect(error?.code ?? "").toBe("42501");
    expect(data ?? []).toEqual([]);
  });
});

describe("child rows follow their order", () => {
  it("completions and payments are visible to the assigned technician and staff only", async () => {
    const order = await createOrder(admin, { p_technician_id: userId("ali") });
    await ali.rpc("start_job", { p_order_id: order.id });
    const done = await ali.rpc("complete_job", {
      p_order_id: order.id,
      p_work_done: "Servicing",
      p_extra_sen: 0,
      p_payment_amount_sen: 25000,
      p_payment_method: "qr",
    });
    expect(done.error).toBeNull();

    for (const table of ["completions", "payments"] as const) {
      const rows = async (client: SupabaseClient) =>
        ((await client.from(table).select("order_id").eq("order_id", order.id)).data ?? []).length;
      expect(await rows(ali), `${table} for Ali`).toBe(1);
      expect(await rows(manager), `${table} for manager`).toBe(1);
      expect(await rows(john), `${table} for John`).toBe(0);
    }
  });
});

describe("profile visibility", () => {
  it("technicians see themselves and staff, not other technicians", async () => {
    const { data } = await ali.from("profiles").select("id");
    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(userId("ali"));
    expect(ids).toContain(userId("aisyah"));
    expect(ids).toContain(userId("rahman"));
    expect(ids).not.toContain(userId("john"));
  });

  it("managers see every profile, including deactivated technicians", async () => {
    const { data } = await manager.from("profiles").select("id");
    expect((data ?? []).map((row) => row.id)).toContain(userId("hafiz"));
  });
});

describe("job file storage", () => {
  const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

  it("the assigned technician can upload to their open job's folder, others cannot", async () => {
    const forAli = await createOrder(admin, { p_technician_id: userId("ali") });
    const path = `orders/${forAli.id}/${Date.now()}-photo.png`;

    const own = await ali.storage.from("job-files").upload(path, png, { contentType: "image/png" });
    expect(own.error).toBeNull();

    const other = await john.storage
      .from("job-files")
      .upload(`orders/${forAli.id}/${Date.now()}-john.png`, png, { contentType: "image/png" });
    expect(other.error).not.toBeNull();

    const readByJohn = await john.storage.from("job-files").download(path);
    expect(readByJohn.error).not.toBeNull();
    const readByManager = await manager.storage.from("job-files").download(path);
    expect(readByManager.error).toBeNull();
  });

  it("rejects paths outside orders/<order id>/", async () => {
    const { error } = await ali.storage
      .from("job-files")
      .upload(`elsewhere/${Date.now()}.png`, png, { contentType: "image/png" });
    expect(error).not.toBeNull();
  });
});

describe("deactivated users", () => {
  it("can authenticate at the Auth layer but read nothing", async () => {
    const hafiz = anonClient();
    const { error: signInError } = await hafiz.auth.signInWithPassword({
      email: "hafiz@sejuk.test",
      password: DEMO_PASSWORD,
    });
    expect(signInError).toBeNull();
    const { data } = await hafiz.from("orders").select("id").limit(5);
    expect(data).toEqual([]);
  });
});

describe("audit_log visibility", () => {
  it("technicians read only their own orders' history; managers read all", async () => {
    const forJohn = await createOrder(admin, { p_technician_id: userId("john") });
    const { data: aliRows } = await ali.from("audit_log").select("id").eq("order_id", forJohn.id);
    const { data: managerRows } = await manager.from("audit_log").select("id").eq("order_id", forJohn.id);
    expect(aliRows).toEqual([]);
    expect((managerRows ?? []).length).toBeGreaterThan(0);
  });
});
