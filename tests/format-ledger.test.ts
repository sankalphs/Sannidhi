import { describe, expect, it } from "vitest";

import { LEDGER_CATEGORY_LABEL, ledgerDisplayCategory } from "@/lib/format/ledger";

describe("ledgerDisplayCategory", () => {
  it("derives Schedule from the type prefix of attendance-category events", () => {
    expect(ledgerDisplayCategory("attendance", "schedule.slot_created")).toBe("schedule");
    expect(
      LEDGER_CATEGORY_LABEL[ledgerDisplayCategory("attendance", "schedule.venue_deleted")],
    ).toBe("Schedule");
  });

  it("keeps stored categories for everything else", () => {
    expect(ledgerDisplayCategory("attendance", "attendance.stepup_completed")).toBe("attendance");
    expect(ledgerDisplayCategory("attendance", "session.closed")).toBe("attendance");
    expect(ledgerDisplayCategory("identity", "invite.created")).toBe("identity");
    expect(ledgerDisplayCategory("device", "device.registered")).toBe("device");
  });
});
