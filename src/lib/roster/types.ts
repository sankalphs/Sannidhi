// One normalized roster row = one intended enrollment.
export type RosterRow = {
  departmentCode: string;
  departmentName: string;
  courseCode: string;
  courseTitle: string;
  sectionName: string;
  term?: string;
  studentEmail: string;
  studentName: string;
  studentUsn?: string;
};

export type RosterIssue = {
  row: number;
  field: string;
  message: string;
};

export type ParsedRoster = {
  rows: RosterRow[];
  issues: RosterIssue[];
};

// Snapshot of what already exists in the institution (fetched by the convex mutation).
export type RosterCatalogSnapshot = {
  departments: { id: string; code: string; name: string }[];
  courses: { id: string; code: string; title: string; departmentId?: string | null }[];
  sections: { id: string; courseId: string; name: string; term?: string | null }[];
  enrollments: { studentId: string; sectionId: string }[];
  studentsByEmail: Record<string, { id: string; name: string; usn?: string | null }>;
};

export type RosterDiff = {
  departmentsToCreate: { code: string; name: string }[];
  coursesToCreate: { code: string; title: string; departmentCode: string }[];
  coursesToUpdate: { id: string; code: string; title: string; departmentId: string | null }[];
  sectionsToCreate: { courseCode: string; sectionName: string; term?: string }[];
  enrollmentsToCreate: {
    studentEmail: string;
    courseCode: string;
    sectionName: string;
    term?: string;
  }[];
  enrollmentsExisting: number;
  pendingInviteEmails: string[];
  droppedRows: RosterIssue[];
};
