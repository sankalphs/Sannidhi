/**
 * RFC 4180 CSV serializer: quotes when needed, doubles embedded quotes,
 * CRLF rows, trailing CRLF. Formula-like string values (=, +, -, @) are
 * prefixed with a single quote so spreadsheet apps render them as text
 * instead of evaluating attacker-influenced content (CSV injection);
 * numeric cells stay untouched.
 */
export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const needsQuotes = (field: string) => /["\r\n,]/.test(field);

  const escapeField = (field: string) => {
    if (!needsQuotes(field)) return field;
    return `"${field.replace(/"/g, '""')}"`;
  };

  const serializeCell = (cell: string | number | null | undefined) => {
    if (cell === null || cell === undefined) return "";
    if (typeof cell === "number") return escapeField(String(cell));
    return escapeField(/^[=+\-@]/.test(cell) ? `'${cell}` : cell);
  };

  const serializeRow = (row: Array<string | number | null | undefined>) =>
    row.map(serializeCell).join(",");

  const lines = [headers.map(serializeCell).join(","), ...rows.map(serializeRow)];
  return `${lines.join("\r\n")}\r\n`;
}
