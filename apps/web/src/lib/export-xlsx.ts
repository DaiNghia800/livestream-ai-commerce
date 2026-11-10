export interface XlsxColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  kind?: "text" | "number" | "money";
  minWidth?: number;
}

/** Export the filtered list as a real workbook so Excel retains column widths and text types. */
export async function downloadXlsx<T>(
  prefix: string,
  sheetName: string,
  rows: T[],
  columns: XlsxColumn<T>[],
): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const values = rows.map((row) => columns.map((column) => {
    const value = column.value(row);
    if (value === null || value === undefined || value === "") return null;
    if (column.kind === "number" || column.kind === "money") {
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }
    return String(value);
  }));

  sheet.columns = columns.map((column, index) => {
    const longest = Math.max(
      column.header.length,
      ...values.map((row) => String(row[index] ?? "").length),
    );
    return {
      header: column.header,
      key: `column${index}`,
      width: Math.max(column.minWidth ?? 0, Math.min(longest + 3, 64)),
    };
  });

  const header = sheet.getRow(1);
  header.height = 30;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B4D59" } };
  header.alignment = { vertical: "middle", wrapText: true };

  values.forEach((rowValues) => {
    const row = sheet.addRow(rowValues);
    let lines = 1;
    rowValues.forEach((value, index) => {
      const cell = row.getCell(index + 1);
      const column = columns[index];
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.numFmt = column.kind === "money" ? '#,##0.##' : column.kind === "number" ? "#,##0" : "@";
      if (typeof value === "string") {
        const width = sheet.getColumn(index + 1).width ?? 20;
        lines = Math.max(lines, Math.ceil(value.length / Math.max(1, width - 2)));
      }
    });
    row.height = Math.max(22, lines * 17);
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as unknown as ArrayLike<number>);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename(prefix);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function filename(prefix: string): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${prefix}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.xlsx`;
}
