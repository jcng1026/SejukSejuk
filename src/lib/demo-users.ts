/**
 * Seeded demo accounts (supabase/seed.sql). Safe to import from client code:
 * the shared demo password lives in src/features/auth/demo-password.ts, which
 * only server code and tests import.
 */
import type { Role } from "@/lib/roles";

export type { Role };

export interface DemoUser {
  key: string;
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export const DEMO_USERS = [
  {
    key: "aisyah",
    id: "00000000-0000-4000-8000-000000000001",
    email: "aisyah@sejuk.test",
    fullName: "Aisyah",
    role: "admin",
  },
  {
    key: "farid",
    id: "00000000-0000-4000-8000-000000000002",
    email: "farid@sejuk.test",
    fullName: "Farid",
    role: "admin",
  },
  {
    key: "rahman",
    id: "00000000-0000-4000-8000-000000000003",
    email: "rahman@sejuk.test",
    fullName: "Rahman",
    role: "manager",
  },
  {
    key: "ali",
    id: "00000000-0000-4000-8000-000000000011",
    email: "ali@sejuk.test",
    fullName: "Ali",
    role: "technician",
  },
  {
    key: "john",
    id: "00000000-0000-4000-8000-000000000012",
    email: "john@sejuk.test",
    fullName: "John",
    role: "technician",
  },
  {
    key: "bala",
    id: "00000000-0000-4000-8000-000000000013",
    email: "bala@sejuk.test",
    fullName: "Bala",
    role: "technician",
  },
  {
    key: "yusoff",
    id: "00000000-0000-4000-8000-000000000014",
    email: "yusoff@sejuk.test",
    fullName: "Yusoff",
    role: "technician",
  },
  {
    key: "hafiz",
    id: "00000000-0000-4000-8000-000000000015",
    email: "hafiz@sejuk.test",
    fullName: "Hafiz",
    role: "technician",
  },
] as const satisfies readonly DemoUser[];

export type DemoUserKey = (typeof DEMO_USERS)[number]["key"];

export function findDemoUser(key: string): DemoUser | undefined {
  return DEMO_USERS.find((user) => user.key === key);
}
