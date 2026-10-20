export type CsvColumn<TRecord> = {
  header: string;
  render: (record: TRecord) => string | number | null | undefined;
};

/**
 * Characters a spreadsheet treats as the start of a formula. A cell that
 * begins with one of these is evaluated when the file is opened, so a
 * value like `=HYPERLINK("https://evil.example")` becomes a live link or
 * an outbound request.
 */
const csvFormulaTriggerCharacters = new Set([
  "=",
  "+",
  "-",
  "@",
  "\t",
  "\r",
  "\n",
]);

/**
 * Neutralize spreadsheet formula injection (OWASP CSV injection).
 *
 * A leading apostrophe makes the spreadsheet treat the cell as literal
 * text. Values that are genuinely numeric (a negative money amount, a
 * signed quantity) stay untouched so they keep their numeric type.
 */
export function neutralizeCsvFormula(value: string) {
  if (value.length === 0) {
    return value;
  }

  if (!csvFormulaTriggerCharacters.has(value[0])) {
    return value;
  }

  if (Number.isFinite(Number(value))) {
    return value;
  }

  return `'${value}`;
}

function escapeCsvValue(value: string | number | null | undefined) {
  const normalizedValue = value == null ? "" : String(value);
  const sanitizedValue = neutralizeCsvFormula(normalizedValue);

  if (!/[",\r\n]/.test(sanitizedValue)) {
    return sanitizedValue;
  }

  return `"${sanitizedValue.replace(/"/g, "\"\"")}"`;
}

export function buildCsv<TRecord>(
  columns: readonly CsvColumn<TRecord>[],
  records: readonly TRecord[],
) {
  const lines = [
    columns.map((column) => escapeCsvValue(column.header)).join(","),
    ...records.map((record) =>
      columns
        .map((column) => escapeCsvValue(column.render(record)))
        .join(","),
    ),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}

export function formatDateForExportFileName(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function formatCentsForExport(amountInCents: number) {
  return (amountInCents / 100).toFixed(2);
}
