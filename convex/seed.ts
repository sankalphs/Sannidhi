import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { hashInviteToken } from "../src/lib/invites/token";

const DEMO_INVITE_TOKEN = "demo-invite-token";

const DEMO_TABLES = [
  "session_challenges",
  "class_sessions",
  "attendance_events",
  "event_ledger",
  "enrollments",
  "timetable_slots",
  "sections",
  "courses",
  "venues",
  "replacement_requests",
  "device_verifications",
  "biometric_records",
  "passkey_credentials",
  "devices",
  "sessions",
  "auth_challenges",
  "invites",
  "users",
  "institutions",
] as const;

export const clearDemoData = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.SANNIDHI_DEMO_MODE !== "1") {
      return { cleared: false as const, reason: "demo-mode-disabled" as const };
    }
    let deleted = 0;
    for (const table of DEMO_TABLES) {
      for (;;) {
        const rows = await ctx.db.query(table).take(500);
        if (rows.length === 0) break;
        for (const row of rows) {
          await ctx.db.delete(row._id);
          deleted += 1;
        }
      }
    }
    return { cleared: true as const, deleted };
  },
});

export const seedDemoData = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.SANNIDHI_DEMO_MODE !== "1") {
      return { seeded: false as const, reason: "demo-mode-disabled" as const };
    }
    const existingInstitution = await ctx.db.query("institutions").first();
    if (existingInstitution !== null) {
      return { seeded: false as const, reason: "already-seeded" as const };
    }

    const now = Date.now();

    const institutionId = await ctx.db.insert("institutions", {
      name: "Sannidhi Institute of Technology",
      code: "SIT",
      createdAt: now,
    });

    const userData = [
      {
        email: "aarav.patel@sit.edu.in",
        name: "Aarav Patel",
        role: "student" as const,
      },
      {
        email: "diya.sharma@sit.edu.in",
        name: "Diya Sharma",
        role: "student" as const,
      },
      {
        email: "priya.menon@sit.edu.in",
        name: "Priya Menon",
        role: "faculty" as const,
      },
      {
        email: "vikram.desai@sit.edu.in",
        name: "Vikram Desai",
        role: "department_authority" as const,
      },
      {
        email: "ananya.iyer@sit.edu.in",
        name: "Ananya Iyer",
        role: "admin" as const,
      },
      {
        email: "rohan.gupta@sit.edu.in",
        name: "Rohan Gupta",
        role: "auditor" as const,
      },
    ];

    const studentIds: Id<"users">[] = [];
    let adminId: Id<"users"> | undefined;
    let facultyId: Id<"users"> | undefined;
    for (const user of userData) {
      const userId = await ctx.db.insert("users", {
        institutionId,
        email: user.email,
        name: user.name,
        role: user.role,
        status: "active",
        createdAt: now,
      });
      if (user.role === "student") {
        studentIds.push(userId);
      }
      if (user.role === "admin") {
        adminId = userId;
      }
      if (user.role === "faculty") {
        facultyId = userId;
      }
    }
    if (adminId === undefined) {
      throw new Error("seed data must include an admin user");
    }
    if (facultyId === undefined) {
      throw new Error("seed data must include a faculty user");
    }

    const courseData = [
      {
        code: "CS101",
        title: "Introduction to Computer Science",
        department: "Computer Science",
      },
      {
        code: "MA201",
        title: "Discrete Mathematics",
        department: "Mathematics",
      },
      {
        code: "PH105",
        title: "Engineering Physics",
        department: "Physics",
      },
      {
        code: "EC210",
        title: "Digital Electronics",
        department: "Electronics",
      },
    ];

    const sectionIds: Id<"sections">[] = [];
    for (const course of courseData) {
      const courseId = await ctx.db.insert("courses", {
        institutionId,
        code: course.code,
        title: course.title,
        department: course.department,
      });
      const sectionId = await ctx.db.insert("sections", {
        courseId,
        name: `${course.code} - Section A`,
        term: "2026-Autumn",
      });
      sectionIds.push(sectionId);
    }

    const venueData = [
      { name: "Lecture Hall LH-1", capacity: 120 },
      { name: "Computing Lab CL-2", capacity: 60 },
      { name: "Seminar Room SR-3", capacity: 40 },
    ];

    const venueIds: Id<"venues">[] = [];
    for (const venue of venueData) {
      const venueId = await ctx.db.insert("venues", {
        institutionId,
        name: venue.name,
        capacity: venue.capacity,
      });
      venueIds.push(venueId);
    }

    const slotData = [
      { sectionIndex: 0, venueIndex: 0, dayOfWeek: 1, startMinutes: 540, endMinutes: 600 },
      { sectionIndex: 0, venueIndex: 0, dayOfWeek: 3, startMinutes: 540, endMinutes: 600 },
      { sectionIndex: 1, venueIndex: 0, dayOfWeek: 2, startMinutes: 600, endMinutes: 660 },
      { sectionIndex: 1, venueIndex: 2, dayOfWeek: 4, startMinutes: 540, endMinutes: 600 },
      { sectionIndex: 2, venueIndex: 1, dayOfWeek: 1, startMinutes: 660, endMinutes: 720 },
      { sectionIndex: 2, venueIndex: 1, dayOfWeek: 5, startMinutes: 540, endMinutes: 600 },
      { sectionIndex: 3, venueIndex: 2, dayOfWeek: 2, startMinutes: 540, endMinutes: 600 },
      { sectionIndex: 3, venueIndex: 2, dayOfWeek: 4, startMinutes: 660, endMinutes: 720 },
    ];

    let slotCount = 0;
    for (const slot of slotData) {
      await ctx.db.insert("timetable_slots", {
        sectionId: sectionIds[slot.sectionIndex],
        venueId: venueIds[slot.venueIndex],
        dayOfWeek: slot.dayOfWeek,
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes,
      });
      slotCount += 1;
    }

    const seedMoment = new Date(now);
    const todayDayOfWeek = seedMoment.getDay();
    const tomorrowDayOfWeek = (todayDayOfWeek + 1) % 7;
    const currentMinutes = seedMoment.getHours() * 60 + seedMoment.getMinutes();
    const liveStartMinutes = Math.max(0, currentMinutes - 15);
    const liveEndMinutes = Math.min(24 * 60, liveStartMinutes + 90);

    await ctx.db.insert("timetable_slots", {
      sectionId: sectionIds[0],
      venueId: venueIds[0],
      dayOfWeek: todayDayOfWeek,
      startMinutes: liveStartMinutes,
      endMinutes: liveEndMinutes,
      facultyId,
    });
    await ctx.db.insert("timetable_slots", {
      sectionId: sectionIds[1],
      venueId: venueIds[1],
      dayOfWeek: tomorrowDayOfWeek,
      startMinutes: 600,
      endMinutes: 660,
      facultyId,
    });
    slotCount += 2;

    const enrollmentPlan = [
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
      ],
      [
        [1, 0],
        [1, 1],
        [1, 2],
        [1, 3],
      ],
    ];

    let enrollmentCount = 0;
    for (const [studentIndex, pairs] of enrollmentPlan.entries()) {
      for (const pair of pairs) {
        await ctx.db.insert("enrollments", {
          studentId: studentIds[studentIndex],
          sectionId: sectionIds[pair[1]],
          enrolledAt: now,
        });
        enrollmentCount += 1;
      }
    }

    let deviceCount = 0;
    for (const [studentIndex, studentId] of studentIds.entries()) {
      await ctx.db.insert("passkey_credentials", {
        userId: studentId,
        credentialId: `demo-credential-${studentIndex}`,
        publicKey: "demo-public-key",
        counter: 0,
        label: "Demo passkey",
        createdAt: now,
        lastUsedAt: now,
      });
      await ctx.db.insert("devices", {
        institutionId,
        userId: studentId,
        label: `Demo laptop ${studentIndex + 1}`,
        platform: "web",
        state: "active",
        registeredAt: now,
        activatedAt: now,
        stateChangedAt: now,
      });
      deviceCount += 1;
    }

    const invitedEmail = "meera.nair@sit.edu.in";
    await ctx.db.insert("users", {
      institutionId,
      email: invitedEmail,
      name: "Meera Nair",
      role: "student",
      status: "invited",
      createdAt: now,
    });

    const demoInviteEnabled =
      process.env.SEED_DEMO_INVITE === "1" || process.env.CONVEX_CLOUD_URL === undefined;
    let inviteCount = 0;
    if (demoInviteEnabled) {
      await ctx.db.insert("invites", {
        institutionId,
        email: invitedEmail,
        role: "student",
        tokenHash: await hashInviteToken(DEMO_INVITE_TOKEN),
        status: "pending",
        invitedByUserId: adminId,
        createdAt: now,
        expiresAt: now + 7 * 24 * 60 * 60 * 1000,
      });
      inviteCount = 1;
    }

    return {
      institutions: 1,
      users: userData.length + 1,
      invites: inviteCount,
      courses: courseData.length,
      sections: sectionIds.length,
      venues: venueIds.length,
      timetableSlots: slotCount,
      enrollments: enrollmentCount,
      devices: deviceCount,
    };
  },
});
