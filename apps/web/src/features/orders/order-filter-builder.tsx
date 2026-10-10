"use client";

/**
 * Bộ dựng điều kiện lọc đơn hàng.
 *
 * Mỗi dòng là một điều kiện: TRƯỜNG · PHÉP SO · GIÁ TRỊ. Thêm bớt
 * được, và chọn khớp TẤT CẢ hay BẤT KỲ.
 *
 * Vì sao không dùng vài ô select rời như trước: giữa phiên live shop
 * hỏi những câu ghép, kiểu "đơn đã xác nhận NHƯNG chưa tạo khoản thu"
 * hoặc "đơn trên 500k đang giữ tồn". Mấy ô rời chỉ trả lời được câu
 * một vế.
 *
 * Toàn bộ việc lọc chạy TRÊN TRÌNH DUYỆT, trên lô đơn đã tải. API chỉ
 * lọc được theo trạng thái và nguồn, không đủ cho bộ dựng này — và
 * đẩy từng tổ hợp xuống server thì mỗi lần sửa một điều kiện lại phải
 * chờ mạng.
 */

import { useEffect, useRef, useState } from "react";
import {
  Check,
  CircleDollarSign,
  Clock,
  ListFilter,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Tag,
  Truck,
  Wallet,
} from "lucide-react";
import type { OrderListItem } from "@/lib/api";
import { orderSources, orderStatuses, type OrderStatusKey } from "./labels";
import styles from "./order-filter-builder.module.css";

export type MatchMode = "ALL" | "ANY";

export interface FilterRow {
  id: string;
  field: FieldKey;
  op: string;
  /** Danh sách giá trị đã chọn (kiểu `multi`). */
  values: string[];
  /** Hai đầu khoảng (kiểu `range`) hoặc chuỗi tìm (kiểu `text`). */
  from: string;
  to: string;
}

export type FieldKey =
  | "status"
  | "payment"
  | "source"
  | "hold"
  | "total"
  | "cod";

type FieldKind = "multi" | "range";

interface FieldDef {
  key: FieldKey;
  label: string;
  icon: typeof Tag;
  kind: FieldKind;
  /** Phép so cho phép, nhãn hiển thị theo thứ tự. */
  ops: Array<{ value: string; label: string }>;
  options?: Array<{ value: string; label: string }>;
  /** Giá trị của đơn ứng với trường này, để so sánh. */
  pick?: (o: OrderListItem, now: number) => string | number | null;
}

const LA = [
  { value: "is", label: "là" },
  { value: "isNot", label: "không phải" },
];

const statusOptions = (Object.keys(orderStatuses) as OrderStatusKey[]).map((k) => ({
  value: k,
  label: orderStatuses[k].label,
}));

export const FIELDS: FieldDef[] = [
  {
    key: "status",
    label: "Trạng thái đơn",
    icon: ListFilter,
    kind: "multi",
    ops: LA,
    options: statusOptions,
    pick: (o) => o.status,
  },
  {
    key: "payment",
    label: "Thanh toán",
    icon: Wallet,
    kind: "multi",
    ops: LA,
    options: [
      { value: "PAID", label: "Đã thu đủ" },
      { value: "PENDING", label: "Chưa thu đủ" },
      { value: "NONE", label: "Chưa tạo khoản thu" },
    ],
    // Đơn chưa có khoản thu trả về null — quy về "NONE" để so được.
    pick: (o) => o.paymentStatus ?? "NONE",
  },
  {
    key: "source",
    label: "Nguồn đơn",
    icon: Tag,
    kind: "multi",
    ops: LA,
    options: Object.entries(orderSources).map(([value, label]) => ({
      value,
      label,
    })),
    pick: (o) => o.source,
  },
  {
    key: "hold",
    label: "Giữ hàng",
    icon: Clock,
    kind: "multi",
    ops: LA,
    options: [
      { value: "HOLDING", label: "Đang giữ tồn" },
      { value: "EXPIRING", label: "Còn dưới 1 phút" },
      { value: "NONE", label: "Không giữ tồn" },
    ],
    pick: (o, now) => {
      if (!o.heldUntil) return "NONE";
      const con = (new Date(o.heldUntil).getTime() - now) / 1000;
      return con < 60 ? "EXPIRING" : "HOLDING";
    },
  },
  {
    key: "total",
    label: "Tổng tiền",
    icon: CircleDollarSign,
    kind: "range",
    ops: [{ value: "between", label: "trong khoảng" }],
    pick: (o) => Number(o.totalAmount),
  },
  {
    key: "cod",
    label: "Thu hộ COD",
    icon: Truck,
    kind: "multi",
    ops: LA,
    options: [
      { value: "BLOCKED", label: "Bị chặn" },
      { value: "ALLOWED", label: "Được phép" },
    ],
    pick: (o) => (o.codBlocked ? "BLOCKED" : "ALLOWED"),
  },
];

/**
 * Bốn điều kiện mở sẵn khi mở bảng lọc.
 *
 * Mở ra trống trơn thì người dùng phải đoán có những gì lọc được rồi
 * mới bấm thêm từng cái. Bốn trường hay dùng nhất bày sẵn, chưa chọn
 * giá trị nên chưa lọc gì — thừa thì bấm dấu trừ để bỏ.
 */
export const MAC_DINH: FieldKey[] = ["status", "payment", "source", "hold"];

export function rowsMacDinh(): FilterRow[] {
  return MAC_DINH.map(newRow);
}

export function fieldDef(key: FieldKey): FieldDef {
  return FIELDS.find((f) => f.key === key)!;
}

export function newRow(field: FieldKey): FilterRow {
  const def = fieldDef(field);
  return {
    id: `${field}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    field,
    op: def.ops[0].value,
    values: [],
    from: "",
    to: "",
  };
}

/**
 * Một điều kiện có đang "có hiệu lực" không.
 *
 * Dòng vừa thêm mà chưa chọn giá trị thì BỎ QUA thay vì cho ra kết quả
 * rỗng — nếu không, mỗi lần bấm thêm điều kiện là bảng trắng xoá và
 * người dùng tưởng mình làm hỏng.
 */
function coHieuLuc(row: FilterRow): boolean {
  const def = fieldDef(row.field);
  if (def.kind === "multi") return row.values.length > 0;
  return row.from !== "" || row.to !== "";
}

function khop(row: FilterRow, order: OrderListItem, now: number): boolean {
  const def = fieldDef(row.field);
  const giaTri = def.pick!(order, now);

  if (def.kind === "range") {
    const so = Number(giaTri);
    if (row.from !== "" && so < Number(row.from)) return false;
    if (row.to !== "" && so > Number(row.to)) return false;
    return true;
  }

  const co = row.values.includes(String(giaTri));
  return row.op === "isNot" ? !co : co;
}

/** Áp toàn bộ điều kiện lên một đơn. */
export function apDung(
  rows: FilterRow[],
  mode: MatchMode,
  order: OrderListItem,
  now: number,
): boolean {
  const dung = rows.filter(coHieuLuc);
  if (dung.length === 0) return true;
  return mode === "ALL"
    ? dung.every((r) => khop(r, order, now))
    : dung.some((r) => khop(r, order, now));
}

export function demDieuKien(rows: FilterRow[]): number {
  return rows.filter(coHieuLuc).length;
}

// ── Giao diện ───────────────────────────────────────────────────────

/** Đóng popover khi bấm ra ngoài hoặc bấm Esc. */
export function useDongKhiBamNgoai(mo: boolean, dong: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mo) return;

    const ngoai = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) dong();
    };
    const phim = (e: KeyboardEvent) => {
      if (e.key === "Escape") dong();
    };

    document.addEventListener("mousedown", ngoai);
    document.addEventListener("keydown", phim);
    return () => {
      document.removeEventListener("mousedown", ngoai);
      document.removeEventListener("keydown", phim);
    };
  }, [mo, dong]);

  return ref;
}

function ChonNhieu({
  row,
  onChange,
}: {
  row: FilterRow;
  onChange: (values: string[]) => void;
}) {
  const [mo, setMo] = useState(false);
  const ref = useDongKhiBamNgoai(mo, () => setMo(false));
  const def = fieldDef(row.field);

  const nhan =
    row.values.length === 0
      ? "Chọn giá trị…"
      : row.values
          .map((v) => def.options?.find((o) => o.value === v)?.label ?? v)
          .join(", ");

  return (
    <div className={styles.multi} ref={ref}>
      <button
        type="button"
        className={styles.multiTrigger}
        aria-expanded={mo}
        aria-label={`Giá trị cho ${def.label}`}
        onClick={() => setMo((v) => !v)}
      >
        <span
          className={`${styles.multiValue} ${
            row.values.length === 0 ? styles.multiPlaceholder : ""
          }`}
        >
          {nhan}
        </span>
        <span aria-hidden="true">▾</span>
      </button>

      {mo && (
        <div className={styles.popover} role="listbox" aria-multiselectable="true">
          {def.options!.map((o) => {
            const chon = row.values.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={chon}
                className={`${styles.option} ${chon ? styles.optionOn : ""}`}
                onClick={() =>
                  onChange(
                    chon
                      ? row.values.filter((v) => v !== o.value)
                      : [...row.values, o.value],
                  )
                }
              >
                <Check
                  size={14}
                  aria-hidden="true"
                  style={{ opacity: chon ? 1 : 0.15 }}
                />
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface FilterBuilderProps {
  rows: FilterRow[];
  mode: MatchMode;
  onRowsChange: (rows: FilterRow[]) => void;
  onModeChange: (mode: MatchMode) => void;
  onReset: () => void;
  onSave: () => void;
  /** Số đơn còn lại sau khi lọc, hiện ở chân bảng. */
  ketQua: number;
}

export function OrderFilterBuilder({
  rows,
  mode,
  onRowsChange,
  onModeChange,
  onReset,
  onSave,
  ketQua,
}: FilterBuilderProps) {
  const [moThem, setMoThem] = useState(false);
  const refThem = useDongKhiBamNgoai(moThem, () => setMoThem(false));

  const daDung = new Set(rows.map((r) => r.field));
  const conLai = FIELDS.filter((f) => !daDung.has(f.key));

  function sua(id: string, patch: Partial<FilterRow>) {
    onRowsChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <label htmlFor="match-mode">Khớp</label>
        <select
          id="match-mode"
          className={styles.control}
          style={{ width: "auto" }}
          value={mode}
          onChange={(e) => onModeChange(e.target.value as MatchMode)}
        >
          <option value="ALL">Tất cả</option>
          <option value="ANY">Bất kỳ</option>
        </select>
        <span>các điều kiện sau:</span>
      </div>

      {rows.length === 0 ? (
        <p className={styles.empty}>
          Chưa có điều kiện nào. Bấm <strong>Thêm điều kiện</strong> để bắt đầu
          lọc.
        </p>
      ) : (
        <div className={styles.rows}>
          {rows.map((row) => {
            const def = fieldDef(row.field);
            const Icon = def.icon;
            return (
              <div className={styles.row} key={row.id}>
                <span className={styles.field}>
                  <Icon size={15} aria-hidden="true" />
                  <span className={styles.fieldName}>{def.label}</span>
                </span>

                <select
                  className={styles.control}
                  aria-label={`Phép so cho ${def.label}`}
                  value={row.op}
                  disabled={def.ops.length === 1}
                  onChange={(e) => sua(row.id, { op: e.target.value })}
                >
                  {def.ops.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {def.kind === "multi" && (
                  <ChonNhieu
                    row={row}
                    onChange={(values) => sua(row.id, { values })}
                  />
                )}

                {def.kind === "range" && (
                  <div className={styles.range}>
                    <input
                      className={styles.control}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="Từ"
                      aria-label={`${def.label} từ`}
                      value={row.from}
                      onChange={(e) => sua(row.id, { from: e.target.value })}
                    />
                    <span className={styles.rangeDash} aria-hidden="true">
                      –
                    </span>
                    <input
                      className={styles.control}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="Đến"
                      aria-label={`${def.label} đến`}
                      value={row.to}
                      onChange={(e) => sua(row.id, { to: e.target.value })}
                    />
                  </div>
                )}

                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Bỏ điều kiện ${def.label}`}
                  onClick={() => onRowsChange(rows.filter((r) => r.id !== row.id))}
                >
                  <Minus size={16} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.addWrap} ref={refThem}>
        <button
          type="button"
          className={styles.add}
          disabled={conLai.length === 0}
          aria-expanded={moThem}
          title={
            conLai.length === 0 ? "Đã dùng hết các trường lọc" : undefined
          }
          onClick={() => setMoThem((v) => !v)}
        >
          <Plus size={16} aria-hidden="true" /> Thêm điều kiện
        </button>

        {moThem && conLai.length > 0 && (
          <div className={styles.addMenu} role="menu">
            {conLai.map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="menuitem"
                  className={styles.option}
                  onClick={() => {
                    onRowsChange([...rows, newRow(f.key)]);
                    setMoThem(false);
                  }}
                >
                  <Icon size={15} aria-hidden="true" />
                  {f.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.foot}>
        <span className={styles.footNote}>
          {demDieuKien(rows)} điều kiện đang áp dụng · {ketQua} đơn khớp
        </span>
        <button
          type="button"
          className={styles.ghost}
          onClick={onSave}
          disabled={demDieuKien(rows) === 0}
        >
          <Save size={15} aria-hidden="true" /> Lưu bộ lọc
        </button>
        <button
          type="button"
          className={styles.ghost}
          onClick={onReset}
          disabled={rows.length === 0}
        >
          <RotateCcw size={15} aria-hidden="true" /> Đặt lại
        </button>
      </div>
    </div>
  );
}
