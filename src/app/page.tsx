import { redirect } from "next/navigation";

import { LOGIN_PATH } from "@/lib/routes";

// src/proxy.ts normally redirects "/" first (to /home when signed in).
export default function RootPage() {
  redirect(LOGIN_PATH);
}
