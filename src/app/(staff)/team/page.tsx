import type { Metadata } from "next";
import { Suspense } from "react";

import { formatPhone } from "@/features/orders/phone";
import { listTeam } from "@/features/team/queries";
import { TechnicianActiveButton } from "@/features/team/TechnicianActiveButton";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Team · Sejuk Sejuk Ops" };

async function Team() {
  const user = await requireUser(["admin", "manager"]);
  const isManager = user.role === "manager";
  const team = await listTeam();
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {isManager
          ? "Deactivated technicians cannot sign in or be assigned. Reassign their open jobs first."
          : "Only managers can deactivate or reactivate technicians."}
      </p>
      <ul className="flex flex-col gap-2">
        {team.map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4"
          >
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 font-semibold">
                {member.fullName}
                {!member.isActive && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                    Deactivated
                  </span>
                )}
              </span>
              <span className="text-sm text-muted-foreground">
                {member.phone ? formatPhone(member.phone) : "No phone"} · {member.openJobs} open job
                {member.openJobs === 1 ? "" : "s"}
              </span>
            </div>
            {isManager && (
              <TechnicianActiveButton
                profileId={member.id}
                name={member.fullName}
                isActive={member.isActive}
              />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export default function TeamPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl">Technicians</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading the team…</p>}>
        <Team />
      </Suspense>
    </div>
  );
}
