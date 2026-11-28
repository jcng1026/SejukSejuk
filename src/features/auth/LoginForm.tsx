"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { demoSignIn, signIn, type SignInState } from "@/features/auth/actions";

// Role on top, name below: the visible text reads in the same order as the
// button's accessible name, "Sign in as technician Ali" (WCAG 2.5.3).
const DEMO_BUTTONS = [
  { key: "aisyah", role: "Admin", name: "Aisyah" },
  { key: "rahman", role: "Manager", name: "Rahman" },
  { key: "ali", role: "Technician", name: "Ali" },
  { key: "john", role: "Technician", name: "John" },
  { key: "bala", role: "Technician", name: "Bala" },
  { key: "yusoff", role: "Technician", name: "Yusoff" },
] as const;

const INITIAL: SignInState = null;

export function LoginForm() {
  const [passwordState, passwordAction, isSigningIn] = useActionState(signIn, INITIAL);
  const [demoState, demoAction, isDemoSigningIn] = useActionState(demoSignIn, INITIAL);
  const error = (passwordState ?? demoState)?.error.message;

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <h2 className="text-3xl">Sign in</h2>

      <form action={passwordAction} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@sejuksejuk.my"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <Button type="submit" size="lg" className="rounded-full">
          {isSigningIn ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">
        {error}
      </p>

      <form action={demoAction} className="flex flex-col gap-3" aria-busy={isDemoSigningIn}>
        <p className="text-sm text-muted-foreground">Demo — sign in as</p>
        <div className="grid grid-cols-3 gap-2">
          {DEMO_BUTTONS.map((demo) => (
            <Button
              key={demo.key}
              type="submit"
              name="user"
              value={demo.key}
              variant="outline"
              className="h-auto flex-col gap-0 rounded-2xl py-2"
              aria-label={`Sign in as ${demo.role.toLowerCase()} ${demo.name}`}
            >
              <span className="text-xs font-normal text-muted-foreground">{demo.role}</span>{" "}
              <span className="font-semibold">{demo.name}</span>
            </Button>
          ))}
        </div>
      </form>
    </div>
  );
}
