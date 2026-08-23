import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const seedDemoData = mutation({
  args: {},
  handler: async (ctx) => {
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
    for (const user of userData) {
      const userId = await ctx.db.insert("users", {
        institutionId,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: now,
      });
      if (user.role === "student") {
        studentIds.push(userId);
      }
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
      await ctx.db.insert("timetableSlots", {
        sectionId: sectionIds[slot.sectionIndex],
        venueId: venueIds[slot.venueIndex],
        dayOfWeek: slot.dayOfWeek,
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes,
      });
      slotCount += 1;
    }

    const enrollmentPlan = [
      [
        [0, 0],
        [0, 1],
      ],
      [
        [1, 2],
        [1, 3],
      ],
    ];

    let enrollmentCount = 0;
    for (const [studentIndex, pairs] of enrollmentPlan.entries()) {
      for (const pair of pairs) {
        await ctx.db.insert("enrollments", {
          studentId: studentIds[studentIndex],
          sectionId: sectionIds[pair[0]],
          enrolledAt: now,
        });
        enrollmentCount += 1;
      }
    }

    return {
      institutions: 1,
      users: userData.length,
      courses: courseData.length,
      sections: sectionIds.length,
      venues: venueIds.length,
      timetableSlots: slotCount,
      enrollments: enrollmentCount,
    };
  },
});
