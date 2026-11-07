/**
 * One quoted CSV cell, mirroring the server's historyExport csvCell: quotes are doubled and
 * text starting with = + - @ tab or CR gets a leading ' so spreadsheets do not run it.
 * @param value Cell value; null and undefined become an empty cell.
 */
export function csvCell(value: unknown): string {
  const text =
    value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const guard = typeof value === 'string' && /^[=+@\-\t\r]/.test(text) ? "'" : '';
  return `"${guard}${text.replaceAll('"', '""')}"`;
}
