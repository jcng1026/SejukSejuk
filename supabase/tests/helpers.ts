import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { expect } from "vitest";

import { DEMO_PASSWORD } from "@/features/auth/demo-password";
import { findDemoUser, type DemoUserKey } from "@/lib/demo-users";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function anonClient(): SupabaseClient {
  if (!url || !key) {
    throw new Error("DB tests need NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function userId(user: DemoUserKey): string {
  const found = findDemoUser(user);
  if (!found) throw new Error(`Unknown demo user ${user}`);
  return found.id;
}

/** A client signed in as a seeded demo user; every query runs under that user's RLS. */
export async function signInAs(user: DemoUserKey): Promise<SupabaseClient> {
  const client = anonClient();
  const email = findDemoUser(user)?.email ?? "";
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw new Error(`Sign-in as ${user} failed: ${error.message}`);
  return client;
}

let uniqueCounter = 0;
/** A customer name no other test uses, so assertions never see another test's rows. */
export function uniqueCustomer(label: string): string {
  uniqueCounter += 1;
  return `Test ${label} ${Date.now()}-${uniqueCounter}`;
}

export interface NewOrder {
  p_customer_name: string;
  p_customer_phone: string;
  p_customer_address: string;
  p_problem_description: string;
  p_service_type_id: number;
  p_quoted_sen: number;
  p_scheduled_at: string;
  p_technician_id?: string | null;
  p_admin_notes?: string | null;
}

export function newOrder(overrides: Partial<NewOrder> = {}): NewOrder {
  return {
    p_customer_name: uniqueCustomer("customer"),
    p_customer_phone: "60123456789",
    p_customer_address: "No. 12, Jalan Sejuk 3/2, Shah Alam",
    p_problem_description: "Aircond not cold",
    p_service_type_id: 2,
    p_quoted_sen: 25000,
    p_scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
    p_technician_id: userId("ali"),
    ...overrides,
  };
}

export interface CreatedOrder {
  id: string;
  order_no: string;
  status: string;
}

export async function createOrder(
  admin: SupabaseClient,
  overrides: Partial<NewOrder> = {},
): Promise<CreatedOrder> {
  const { data, error } = await admin.rpc("create_order", newOrder(overrides)).single<CreatedOrder>();
  if (error) throw new Error(`create_order failed: ${error.message}`);
  return data;
}

/** Asserts an RPC/query failed with our error-code prefix (docs/3-design/05-api-spec.md §1). */
export function expectErrorCode(error: PostgrestError | null, code: string): void {
  expect(error, `expected ${code} error`).not.toBeNull();
  expect(error?.message.startsWith(`${code}:`), `got: ${error?.message}`).toBe(true);
}
