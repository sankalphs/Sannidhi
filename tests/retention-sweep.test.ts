import { describe, expect, it } from "vitest";

import { MAX_RETENTION_DAYS, MIN_RETENTION_DAYS } from "@/lib/compliance/retention";
import {
  buildRetentionTable,
  isPrunable,
  minRetentionDays,
  MS_PER_DAY,
} from "../convex/lib/retentionSweep";

const NOW = 1_700_000_000_000;
const instA = "inst-a";
const instB = "inst-b";
const instC = "inst-c";

const institutions = [{ _id: instA }, { _id: instB }, { _id: instC }];

describe("buildRetentionTable", () => {
  it("falls back to the env horizon for institutions without a policy row", () => {
    const table = buildRetentionTable({
      institutions,
      policyRows: [],
      envRetentionDays: 730,
    });
    expect(table).toEqual([
      { institutionId: instA, retentionDays: 730 },
      { institutionId: instB, retentionDays: 730 },
      { institutionId: instC, retentionDays: 730 },
    ]);
  });

  it("uses the institution-scope row's retentionDays when present", () => {
    const table = buildRetentionTable({
      institutions,
      policyRows: [{ institutionId: instA, scope: "institution", settings: { retentionDays: 90 } }],
      envRetentionDays: 730,
    });
    expect(table.find((entry) => entry.institutionId === instA)?.retentionDays).toBe(90);
    expect(table.find((entry) => entry.institutionId === instB)?.retentionDays).toBe(730);
  });

  it("clamps out-of-range retentionDays per resolveRetentionDays semantics", () => {
    // resolveRetentionDays clamps finite values into [MIN, MAX] rather than falling back.
    const table = buildRetentionTable({
      institutions,
      policyRows: [
        { institutionId: instA, scope: "institution", settings: { retentionDays: 1 } },
        { institutionId: instB, scope: "institution", settings: { retentionDays: 99999 } },
      ],
      envRetentionDays: 730,
    });
    expect(table.find((entry) => entry.institutionId === instA)?.retentionDays).toBe(
      MIN_RETENTION_DAYS,
    );
    expect(table.find((entry) => entry.institutionId === instB)?.retentionDays).toBe(
      MAX_RETENTION_DAYS,
    );
    expect(table.find((entry) => entry.institutionId === instC)?.retentionDays).toBe(730);
  });

  it("ignores department- and venue-scope rows", () => {
    const table = buildRetentionTable({
      institutions,
      policyRows: [
        { institutionId: instA, scope: "department", settings: { retentionDays: 30 } },
        { institutionId: instA, scope: "venue", settings: { retentionDays: 60 } },
      ],
      envRetentionDays: 730,
    });
    expect(table.find((entry) => entry.institutionId === instA)?.retentionDays).toBe(730);
  });

  it("falls back to env when the institution row lacks a finite retentionDays", () => {
    const table = buildRetentionTable({
      institutions,
      policyRows: [
        { institutionId: instA, scope: "institution", settings: {} },
        { institutionId: instB, scope: "institution", settings: { retentionDays: Number.NaN } },
      ],
      envRetentionDays: 365,
    });
    expect(table.find((entry) => entry.institutionId === instA)?.retentionDays).toBe(365);
    expect(table.find((entry) => entry.institutionId === instB)?.retentionDays).toBe(365);
  });

  it("handles empty institutions and null settings defensively", () => {
    const table = buildRetentionTable({
      institutions: [],
      policyRows: [{ institutionId: instA, scope: "institution", settings: null }],
      envRetentionDays: 730,
    });
    expect(table).toEqual([]);
  });
});

describe("isPrunable", () => {
  const table = buildRetentionTable({
    institutions,
    policyRows: [{ institutionId: instA, scope: "institution", settings: { retentionDays: 90 } }],
    envRetentionDays: 730,
  });

  it("prunes rows older than the institution's retention", () => {
    expect(isPrunable(NOW - 91 * MS_PER_DAY, { institutionId: instA, now: NOW, table })).toBe(true);
  });

  it("keeps rows at or newer than the institution's retention", () => {
    expect(isPrunable(NOW - 90 * MS_PER_DAY, { institutionId: instA, now: NOW, table })).toBe(
      false,
    );
    expect(isPrunable(NOW - 89 * MS_PER_DAY, { institutionId: instA, now: NOW, table })).toBe(
      false,
    );
  });

  it("uses the env fallback for institutions without a policy row", () => {
    expect(isPrunable(NOW - 731 * MS_PER_DAY, { institutionId: instB, now: NOW, table })).toBe(
      true,
    );
    expect(isPrunable(NOW - 729 * MS_PER_DAY, { institutionId: instB, now: NOW, table })).toBe(
      false,
    );
  });

  it("conservatively keeps rows from unknown institutions", () => {
    expect(isPrunable(NOW - 10_000 * MS_PER_DAY, { institutionId: "ghost", now: NOW, table })).toBe(
      false,
    );
  });
});

describe("minRetentionDays", () => {
  it("returns the env default (clamped) when no institutions exist", () => {
    expect(minRetentionDays([], 730)).toBe(730);
    expect(minRetentionDays([], 5)).toBe(MIN_RETENTION_DAYS);
  });

  it("returns the smallest retention across institutions", () => {
    const table = [
      { institutionId: instA, retentionDays: 90 },
      { institutionId: instB, retentionDays: 730 },
    ];
    expect(minRetentionDays(table, 730)).toBe(90);
  });

  it("does not tighten the cutoff when every institution retains longer than the env default", () => {
    const table = [
      { institutionId: instA, retentionDays: 3650 },
      { institutionId: instB, retentionDays: 1095 },
    ];
    expect(minRetentionDays(table, 730)).toBe(1095);
  });
});
