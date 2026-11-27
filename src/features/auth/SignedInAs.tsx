import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { requireUser } from "@/lib/auth";
import type { Role } from "@/lib/roles";

interface SignedInAsProps {
  allowed: readonly Role[];
}

// Temporary home content until Phases 2 and 4 build the real screens.
export async function SignedInAs({ allowed }: SignedInAsProps) {
  const user = await requireUser(allowed);
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-3xl">Hi {user.fullName}</h1>
      <p className="text-muted-foreground">
        Signed in as <span className="font-semibold">{user.role}</span>.
      </p>
      <form action={signOut}>
        <Button type="submit" variant="outline" className="rounded-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
