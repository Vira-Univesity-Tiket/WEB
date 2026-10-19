export const csvCell = (value: unknown): string => {
  let text = String(value ?? '');
  // Spreadsheet programs execute formula prefixes even inside quoted CSV cells.
  if (typeof value !== 'number' && /^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
export const csvRow = (cells: unknown[]): string => cells.map(csvCell).join(',');
