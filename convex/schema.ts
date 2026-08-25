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
    usn: v.optional(v.string()),
    role: v.union(
      v.literal("student"),
      v.literal("faculty"),
      v.literal("department_authority"),
      v.literal("admin"),
      v.literal("auditor"),
    ),
    status: v.optional(v.union(v.literal("invited"), v.literal("active"), v.literal("suspended"))),
    createdAt: v.number(),
  })
    .index("by_institution", ["institutionId"])
    .index("by_email", ["email"])
    .index("by_institution_usn", ["institutionId", "usn"]),

  password_credentials: defineTable({
    userId: v.id("users"),
    hash: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

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
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    geofenceRadiusMeters: v.optional(v.number()),
  }).index("by_institution", ["institutionId"]),

  timetable_slots: defineTable({
    sectionId: v.id("sections"),
    venueId: v.id("venues"),
    dayOfWeek: v.number(),
    startMinutes: v.number(),
    endMinutes: v.number(),
    facultyId: v.optional(v.id("users")),
  })
    .index("by_section", ["sectionId"])
    .index("by_venue", ["venueId"])
    .index("by_faculty_day", ["facultyId", "dayOfWeek"]),

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
    .index("by_section_captured", ["sectionId", "capturedAt"])
    .index("by_section_state", ["sectionId", "state"])
    .index("by_seq", ["seq"])
    .index("by_corrects_event", ["correctsEventId"]),

  invites: defineTable({
    institutionId: v.id("institutions"),
    email: v.string(),
    role: v.union(
      v.literal("student"),
      v.literal("faculty"),
      v.literal("department_authority"),
      v.literal("admin"),
      v.literal("auditor"),
    ),
    tokenHash: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("revoked"),
      v.literal("expired"),
    ),
    invitedByUserId: v.id("users"),
    createdAt: v.number(),
    expiresAt: v.number(),
    acceptedByUserId: v.optional(v.id("users")),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_institution_status", ["institutionId", "status"])
    .index("by_email", ["email"]),

  passkey_credentials: defineTable({
    userId: v.id("users"),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.number(),
    transports: v.optional(v.array(v.string())),
    label: v.optional(v.string()),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_credentialId", ["credentialId"])
    .index("by_user", ["userId"]),

  devices: defineTable({
    institutionId: v.id("institutions"),
    userId: v.id("users"),
    label: v.string(),
    platform: v.optional(v.string()),
    state: v.union(
      v.literal("new"),
      v.literal("enrolled"),
      v.literal("active"),
      v.literal("suspended"),
      v.literal("revoked"),
      v.literal("replaced"),
    ),
    replacesDeviceId: v.optional(v.id("devices")),
    replacedByDeviceId: v.optional(v.id("devices")),
    registeredAt: v.number(),
    activatedAt: v.optional(v.number()),
    stateChangedAt: v.number(),
    stateReason: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_institution_state", ["institutionId", "state"])
    .index("by_institution_state_registered", ["institutionId", "state", "registeredAt"]),

  auth_challenges: defineTable({
    challenge: v.string(),
    purpose: v.union(v.literal("registration"), v.literal("authentication")),
    userId: v.optional(v.id("users")),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
  })
    .index("by_challenge", ["challenge"])
    .index("by_expiresAt", ["expiresAt"]),

  sessions: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    credentialId: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    lastSeenAt: v.optional(v.number()),
    lastStepUpAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_user", ["userId"])
    .index("by_expiresAt", ["expiresAt"]),

  device_verifications: defineTable({
    deviceId: v.id("devices"),
    codeHash: v.string(),
    expiresAt: v.number(),
    attempts: v.number(),
    consumedAt: v.optional(v.number()),
  }).index("by_device", ["deviceId"]),

  replacement_requests: defineTable({
    institutionId: v.id("institutions"),
    studentId: v.id("users"),
    oldDeviceId: v.id("devices"),
    reason: v.string(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    requestedAt: v.number(),
    decidedByUserId: v.optional(v.id("users")),
    decidedAt: v.optional(v.number()),
    successorDeviceId: v.optional(v.id("devices")),
  })
    .index("by_status", ["status"])
    .index("by_student", ["studentId"])
    .index("by_status_requested", ["status", "requestedAt"])
    .index("by_institution_status_requested", ["institutionId", "status", "requestedAt"]),

  biometric_records: defineTable({
    userId: v.id("users"),
    consentVersion: v.string(),
    consentedAt: v.number(),
    faceTemplateRef: v.optional(v.string()),
    faceEnrolledAt: v.optional(v.number()),
    withdrawnAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  event_ledger: defineTable({
    institutionId: v.id("institutions"),
    category: v.union(v.literal("device"), v.literal("identity"), v.literal("attendance")),
    type: v.string(),
    actorUserId: v.optional(v.id("users")),
    subjectUserId: v.optional(v.id("users")),
    deviceId: v.optional(v.id("devices")),
    payload: v.any(),
    seq: v.number(),
    prevEventHash: v.optional(v.string()),
    eventHash: v.string(),
    createdAt: v.number(),
  })
    .index("by_institution_seq", ["institutionId", "seq"])
    .index("by_subject", ["subjectUserId"])
    .index("by_subject_created", ["subjectUserId", "createdAt"])
    .index("by_subject_category_type_created", ["subjectUserId", "category", "type", "createdAt"])
    .index("by_device", ["deviceId"]),

  class_sessions: defineTable({
    institutionId: v.id("institutions"),
    courseId: v.id("courses"),
    sectionId: v.id("sections"),
    venueId: v.id("venues"),
    facultyId: v.id("users"),
    kind: v.union(v.literal("scheduled"), v.literal("guest")),
    timetableSlotId: v.optional(v.id("timetable_slots")),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("closed")),
    startedAt: v.number(),
    windowEndsAt: v.number(),
    pausedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    restartOfSessionId: v.optional(v.id("class_sessions")),
  })
    .index("by_faculty_status", ["facultyId", "status"])
    .index("by_section_started", ["sectionId", "startedAt"])
    .index("by_institution_status", ["institutionId", "status"])
    .index("by_status_windowEndsAt", ["status", "windowEndsAt"])
    .index("by_windowEndsAt", ["windowEndsAt"]),

  session_challenges: defineTable({
    institutionId: v.id("institutions"),
    sessionId: v.id("class_sessions"),
    nonceHash: v.string(),
    issuedAt: v.number(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    consumedByUserId: v.optional(v.id("users")),
  })
    .index("by_nonceHash", ["nonceHash"])
    .index("by_session_issued", ["sessionId", "issuedAt"])
    .index("by_expiresAt", ["expiresAt"]),

  access_requests: defineTable({
    institution: v.string(),
    name: v.string(),
    email: v.string(),
    requestedRole: v.union(
      v.literal("administrator"),
      v.literal("faculty"),
      v.literal("department_authority"),
      v.literal("other"),
    ),
    note: v.optional(v.string()),
    ipHash: v.optional(v.string()),
    status: v.union(v.literal("new"), v.literal("reviewed")),
    submittedAt: v.number(),
    reviewedAt: v.optional(v.number()),
  })
    .index("by_status_submitted", ["status", "submittedAt"])
    .index("by_email", ["email"])
    .index("by_ipHash_submitted", ["ipHash", "submittedAt"]),

  attendance_requests: defineTable({
    institutionId: v.id("institutions"),
    studentId: v.id("users"),
    type: v.union(v.literal("correction"), v.literal("exemption"), v.literal("on_duty")),
    reason: v.string(),
    status: v.union(v.literal("submitted"), v.literal("reviewed")),
    requestedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedByUserId: v.optional(v.id("users")),
  })
    .index("by_student_requested", ["studentId", "requestedAt"])
    .index("by_student_status_requested", ["studentId", "status", "requestedAt"])
    .index("by_institution_status", ["institutionId", "status"]),
});
