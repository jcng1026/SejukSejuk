"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { demoSignIn, signIn, type SignInState } from "@/features/auth/actions";

const DEMO_BUTTONS = [
  { key: "aisyah", label: "Admin", hint: "Aisyah", spoken: "admin Aisyah" },
  { key: "rahman", label: "Manager", hint: "Rahman", spoken: "manager Rahman" },
  { key: "ali", label: "Ali", hint: "Technician", spoken: "technician Ali" },
  { key: "john", label: "John", hint: "Technician", spoken: "technician John" },
  { key: "bala", label: "Bala", hint: "Technician", spoken: "technician Bala" },
  { key: "yusoff", label: "Yusoff", hint: "Technician", spoken: "technician Yusoff" },
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
              aria-label={`Sign in as ${demo.spoken}`}
            >
              <span className="font-semibold">{demo.label}</span>
              <span className="text-xs font-normal text-muted-foreground">{demo.hint}</span>
            </Button>
          ))}
        </div>
      </form>
    </div>
  );
}
