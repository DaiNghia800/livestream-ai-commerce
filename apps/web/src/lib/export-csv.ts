/**
 * Xuất bảng ra tệp CSV mở được bằng Excel.
 *
 * Dùng CSV thay vì .xlsx thật: tạo xlsx cần thêm một thư viện cả
 * trăm KB vào gói tải về, trong khi Excel trên Windows mặc định mở
 * .csv và nhận đủ dữ liệu. Đổi sang xlsx sau này chỉ phải thay mỗi
 * hàm này.
 */

/**
 * Bọc một ô theo RFC 4180.
 *
 * Bắt buộc với dữ liệu tiếng Việt vì địa chỉ luôn có dấu phẩy —
 * không bọc thì "18 Duy Tân, Cầu Giấy" vỡ thành hai cột và mọi cột
 * phía sau lệch theo.
 */
function o(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [
    columns.map((c) => o(c.header)).join(","),
    ...rows.map((r) => columns.map((c) => o(c.value(r))).join(",")),
  ];

  // BOM UTF-8 ở đầu tệp. Thiếu nó thì Excel đọc theo bảng mã hệ thống
  // và mọi dấu tiếng Việt thành ký tự rác.
  return "﻿" + lines.join("\r\n");
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Thu hồi ngay sau khi trình duyệt kịp bắt đầu tải. Không thu hồi
  // thì mỗi lần xuất lại giữ nguyên cả tệp trong bộ nhớ tới khi đóng
  // tab.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `don-hang-20261011-0930.csv` — có giờ để xuất nhiều lần không đè nhau. */
export function tenTep(prefix: string, ext = "csv"): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
    d.getHours(),
  )}${p(d.getMinutes())}.${ext}`;
}
