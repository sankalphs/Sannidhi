/** RFC 4180 CSV serializer: quotes when needed, doubles embedded quotes, CRLF rows, trailing CRLF. */
export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const needsQuotes = (field: string) => /["\r\n,]/.test(field);

  const escapeField = (field: string) => {
    if (!needsQuotes(field)) return field;
    return `"${field.replace(/"/g, '""')}"`;
  };

  const serializeRow = (row: Array<string | number | null | undefined>) =>
    row
      .map((cell) => {
        if (cell === null || cell === undefined) return "";
        const field = typeof cell === "number" ? String(cell) : cell;
        return escapeField(field);
      })
      .join(",");

  const lines = [serializeRow(headers), ...rows.map(serializeRow)];
  return `${lines.join("\r\n")}\r\n`;
}
