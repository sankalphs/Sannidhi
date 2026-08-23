import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { decisionValidator } from "../src/lib/decision";

export default defineSchema({
  institutions: defineTable({
    name: v.string(),
    code: v.string(),
    createdAt: v.number(),
  }).index("by_code", ["code"]),

  users: defineTable({
    institutionId: v.id("institutions"),
    email: v.string(),
    name: v.string(),
    role: v.union(
      v.literal("student"),
      v.literal("faculty"),
      v.literal("department_authority"),
      v.literal("admin"),
      v.literal("auditor"),
    ),
    status: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_institution", ["institutionId"])
    .index("by_email", ["email"]),

  courses: defineTable({
    institutionId: v.id("institutions"),
    code: v.string(),
    title: v.string(),
    department: v.optional(v.string()),
  }).index("by_institution_code", ["institutionId", "code"]),

  sections: defineTable({
    courseId: v.id("courses"),
    name: v.string(),
    term: v.optional(v.string()),
  }).index("by_course", ["courseId"]),

  venues: defineTable({
    institutionId: v.id("institutions"),
    name: v.string(),
    capacity: v.optional(v.number()),
  }).index("by_institution", ["institutionId"]),

  timetable_slots: defineTable({
    sectionId: v.id("sections"),
    venueId: v.id("venues"),
    dayOfWeek: v.number(),
    startMinutes: v.number(),
    endMinutes: v.number(),
  })
    .index("by_section", ["sectionId"])
    .index("by_venue", ["venueId"]),

  enrollments: defineTable({
    studentId: v.id("users"),
    sectionId: v.id("sections"),
    enrolledAt: v.number(),
  })
    .index("by_student", ["studentId"])
    .index("by_section", ["sectionId"]),

  attendance_events: defineTable({
    institutionId: v.id("institutions"),
    studentId: v.id("users"),
    sectionId: v.id("sections"),
    state: v.union(
      v.literal("initiated"),
      v.literal("authenticated"),
      v.literal("session_verified"),
      v.literal("presence_evaluated"),
      v.literal("risk_evaluated"),
      v.literal("step_up"),
      v.literal("verified"),
      v.literal("flagged"),
      v.literal("rejected"),
      v.literal("corrected"),
    ),
    origin: v.union(v.literal("online"), v.literal("offline-faculty"), v.literal("mobile")),
    policyVersion: v.string(),
    seq: v.number(),
    prevEventHash: v.optional(v.string()),
    eventHash: v.string(),
    correctsEventId: v.optional(v.id("attendance_events")),
    decision: v.optional(decisionValidator),
    capturedAt: v.number(),
    recordedByUserId: v.optional(v.id("users")),
    note: v.optional(v.string()),
  })
    .index("by_student_section", ["studentId", "sectionId"])
    .index("by_section_state", ["sectionId", "state"])
    .index("by_seq", ["seq"]),
});
