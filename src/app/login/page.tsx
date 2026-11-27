import type { Metadata } from "next";

import { LoginForm } from "@/features/auth/LoginForm";
import { LoginHero } from "@/features/auth/LoginHero";

export const metadata: Metadata = { title: "Sign in · Sejuk Sejuk Ops" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh md:grid-cols-[1.2fr_1fr]">
      <LoginHero />
      <div className="flex items-center justify-center bg-card p-8 md:p-12">
        <LoginForm />
      </div>
    </main>
  );
}
