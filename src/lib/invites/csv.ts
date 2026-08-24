import { ROLES, type Role } from "@/lib/auth/session";

export type CsvInviteRow = {
  email: string;
  name: string;
  role: Role;
};

export type CsvParseError = {
  line: number;
  reason: string;
};

export type ParseInviteCsvOptions = {
  existingEmails?: string[];
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HEADER_COLUMNS = ["email", "name", "role"] as const;

type RawRecord = {
  fields: string[];
  line: number;
};

type TokenizeResult = {
  records: RawRecord[];
  error: CsvParseError | null;
};

function tokenize(text: string): TokenizeResult {
  const records: RawRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let fieldWasQuoted = false;
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endField = () => {
    fields.push(field);
    field = "";
    fieldWasQuoted = false;
  };

  const endRecord = () => {
    endField();
    if (fields.length > 1 || fields[0].length > 0) {
      records.push({ fields, line: recordLine });
    }
    fields = [];
    recordLine = line;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line += 1;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (field.length === 0 && !fieldWasQuoted) {
        fieldWasQuoted = true;
        inQuotes = true;
      } else {
        return { records, error: { line: recordLine, reason: "malformed quoting" } };
      }
      continue;
    }
    if (ch === ",") {
      endField();
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      line += 1;
      endRecord();
      continue;
    }
    field += ch;
  }

  if (inQuotes) {
    return { records, error: { line: recordLine, reason: "unterminated quoted field" } };
  }
  endRecord();
  return { records, error: null };
}

export function parseInviteCsv(
  text: string,
  options: ParseInviteCsvOptions = {},
): { rows: CsvInviteRow[]; errors: CsvParseError[] } {
  const rows: CsvInviteRow[] = [];
  const errors: CsvParseError[] = [];

  const withoutBom = text.replace(/^\uFEFF/, "");
  const { records, error } = tokenize(withoutBom);
  if (error !== null) errors.push(error);

  const header = records[0];
  if (header === undefined) {
    errors.push({ line: 1, reason: "missing header row" });
    return { rows, errors };
  }

  const columnIndex = new Map<string, number>();
  header.fields.forEach((raw, index) => columnIndex.set(raw.trim().toLowerCase(), index));
  for (const column of HEADER_COLUMNS) {
    if (!columnIndex.has(column)) {
      errors.push({ line: header.line, reason: `header must include a "${column}" column` });
      return { rows, errors };
    }
  }

  const existingEmails = new Set(
    (options.existingEmails ?? []).map((email) => email.toLowerCase()),
  );
  const seenEmails = new Set<string>();

  for (const record of records.slice(1)) {
    const read = (column: string) => {
      const index = columnIndex.get(column);
      return index === undefined ? "" : (record.fields[index] ?? "").trim();
    };
    const email = read("email");
    const name = read("name");
    const role = read("role").toLowerCase();

    if (email.length === 0 && name.length === 0 && role.length === 0) continue;

    const fail = (reason: string) => errors.push({ line: record.line, reason });

    if (!EMAIL_PATTERN.test(email)) {
      fail(email.length === 0 ? "missing email" : `invalid email "${email}"`);
      continue;
    }
    if (name.length === 0) {
      fail("missing name");
      continue;
    }
    if (!ROLES.includes(role as Role)) {
      fail(role.length === 0 ? "missing role" : `unknown role "${role}"`);
      continue;
    }

    const key = email.toLowerCase();
    if (existingEmails.has(key)) {
      fail(`"${email}" already has an account`);
      continue;
    }
    if (seenEmails.has(key)) {
      fail(`duplicate email "${email}" in file`);
      continue;
    }
    seenEmails.add(key);
    rows.push({ email, name, role: role as Role });
  }

  return { rows, errors };
}

export { EMAIL_PATTERN };
