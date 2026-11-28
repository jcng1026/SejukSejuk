import { describe, expect, it } from "vitest";

import { authorizeToolCall, toolDeclarations, toolsFor } from "./tools";

const names = (role: Parameters<typeof toolsFor>[0]) => toolsFor(role).map((tool) => tool.name);

describe("role tool sets (FR-AI-3)", () => {
  it("gives technicians only their own-data tools", () => {
    expect(names("technician")).toEqual(["jobs_list", "job_detail", "job_counts", "flags_summary"]);
  });

  it("gives admins operations tools but not revenue", () => {
    expect(names("admin")).toEqual([
      "jobs_list",
      "job_detail",
      "job_counts",
      "technician_leaderboard",
      "technician_workload",
      "flags_summary",
    ]);
  });

  it("gives managers everything", () => {
    expect(names("manager")).toContain("revenue_summary");
    expect(names("manager")).toHaveLength(7);
  });

  it("declares a JSON schema for every tool it sends to the model", () => {
    for (const declaration of toolDeclarations("manager")) {
      expect(declaration.function.parameters).toMatchObject({ type: "object" });
      expect(declaration.function.parameters).not.toHaveProperty("$schema");
    }
  });
});

describe("authorizeToolCall (stage 4)", () => {
  it("accepts a valid call from an allowed role", () => {
    expect(
      authorizeToolCall("admin", "job_counts", '{"date_range":"today","status":"completed"}').ok,
    ).toBe(true);
    expect(
      authorizeToolCall(
        "manager",
        "jobs_list",
        '{"date_range":{"from":"2026-11-01","to":"2026-11-30"}}',
      ).ok,
    ).toBe(true);
  });

  it("rejects a tool outside the role, even if the model asks for it", () => {
    expect(
      authorizeToolCall("technician", "revenue_summary", '{"date_range":"today"}'),
    ).toMatchObject({
      ok: false,
      reason: "revenue_summary not allowed for technician",
    });
    expect(authorizeToolCall("admin", "revenue_summary", '{"date_range":"today"}').ok).toBe(false);
    expect(authorizeToolCall("technician", "technician_workload", '{"week":"this_week"}').ok).toBe(
      false,
    );
  });

  it("rejects unknown tools, broken JSON and arguments outside the schema", () => {
    expect(authorizeToolCall("manager", "run_sql", '{"query":"select 1"}').ok).toBe(false);
    expect(authorizeToolCall("manager", "jobs_list", "{not json").ok).toBe(false);
    for (const args of [
      '{"date_range":"forever"}',
      '{"date_range":"today","limit":500}',
      '{"date_range":"today","sql":"drop table orders"}',
      '{"date_range":{"from":"2025-01-01","to":"2026-01-01"}}',
    ]) {
      expect(authorizeToolCall("manager", "jobs_list", args).ok, args).toBe(false);
    }
    expect(authorizeToolCall("manager", "job_detail", '{"order_no":"1 OR 1=1"}').ok).toBe(false);
  });
});
