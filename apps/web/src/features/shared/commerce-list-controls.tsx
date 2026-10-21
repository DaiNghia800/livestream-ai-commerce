"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  Minus,
  Plus,
  RotateCcw,
  Search,
  type LucideIcon,
} from "lucide-react";
import listStyles from "@/features/orders/merchant-order-list.module.css";
import filterStyles from "@/features/orders/order-filter-builder.module.css";

export type MatchMode = "ALL" | "ANY";

export interface ListFilterRow {
  id: string;
  field: string;
  op: "is" | "isNot";
  values: string[];
  from: string;
  to: string;
}

export interface ListFilterField<T> {
  key: string;
  label: string;
  icon: LucideIcon;
  kind: "multi" | "range";
  options?: Array<{ value: string; label: string }>;
  pick: (item: T) => string | number | null;
}

export interface SortOption<K extends string> {
  key: K;
  label: string;
}

function newRow(field: string): ListFilterRow {
  return {
    id: `${field}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    field,
    op: "is",
    values: [],
    from: "",
    to: "",
  };
}

export function defaultFilterRows(keys: string[]): ListFilterRow[] {
  return keys.map(newRow);
}

function active(row: ListFilterRow, kind: "multi" | "range"): boolean {
  return kind === "multi"
    ? row.values.length > 0
    : row.from !== "" || row.to !== "";
}

export function activeFilterCount<T>(
  rows: ListFilterRow[],
  fields: ListFilterField<T>[],
): number {
  return rows.filter((row) => {
    const field = fields.find((f) => f.key === row.field);
    return field && active(row, field.kind);
  }).length;
}

export function matchesFilters<T>(
  item: T,
  rows: ListFilterRow[],
  mode: MatchMode,
  fields: ListFilterField<T>[],
): boolean {
  const conditions = rows.flatMap((row) => {
    const field = fields.find((f) => f.key === row.field);
    return field && active(row, field.kind) ? [{ row, field }] : [];
  });
  if (conditions.length === 0) return true;

  const matches = ({ row, field }: (typeof conditions)[number]) => {
    const value = field.pick(item);
    if (field.kind === "range") {
      const number = Number(value);
      return Number.isFinite(number)
        && (row.from === "" || number >= Number(row.from))
        && (row.to === "" || number <= Number(row.to));
    }
    const included = row.values.includes(String(value));
    return row.op === "isNot" ? !included : included;
  };
  return mode === "ALL" ? conditions.every(matches) : conditions.some(matches);
}

function useCloseOnOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, close]);
  return ref;
}

function MultiValueSelect({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useCloseOnOutside(open, () => setOpen(false));
  const selected = values.map((value) => options.find((option) => option.value === value)?.label ?? value);
  return (
    <div className={filterStyles.multi} ref={ref}>
      <button
        type="button"
        className={filterStyles.multiTrigger}
        aria-label={`Giá trị cho ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`${filterStyles.multiValue} ${!values.length ? filterStyles.multiPlaceholder : ""}`}>
          {selected.length ? selected.join(", ") : "Chọn giá trị…"}
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={filterStyles.popover} role="listbox" aria-multiselectable="true">
          {options.map((option) => {
            const chosen = values.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={chosen}
                className={`${filterStyles.option} ${chosen ? filterStyles.optionOn : ""}`}
                onClick={() => onChange(chosen
                  ? values.filter((value) => value !== option.value)
                  : [...values, option.value])}
              >
                <Check size={14} aria-hidden="true" style={{ opacity: chosen ? 1 : 0.15 }} />
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterBuilder<T>({
  fields,
  rows,
  mode,
  onRowsChange,
  onModeChange,
  resultCount,
  itemLabel,
}: {
  fields: ListFilterField<T>[];
  rows: ListFilterRow[];
  mode: MatchMode;
  onRowsChange: (rows: ListFilterRow[]) => void;
  onModeChange: (mode: MatchMode) => void;
  resultCount: number;
  itemLabel: string;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useCloseOnOutside(addOpen, () => setAddOpen(false));
  const unused = fields.filter((f) => !rows.some((r) => r.field === f.key));

  function update(id: string, patch: Partial<ListFilterRow>) {
    onRowsChange(rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  return (
    <div className={filterStyles.panel}>
      <div className={filterStyles.head}>
        <label htmlFor="commerce-match-mode">Khớp</label>
        <select
          id="commerce-match-mode"
          className={filterStyles.control}
          style={{ width: "auto" }}
          value={mode}
          onChange={(event) => onModeChange(event.target.value as MatchMode)}
        >
          <option value="ALL">Tất cả</option>
          <option value="ANY">Bất kỳ</option>
        </select>
        <span>các điều kiện sau:</span>
      </div>

      {rows.length === 0 ? (
        <p className={filterStyles.empty}>Bấm Thêm điều kiện để bắt đầu lọc.</p>
      ) : (
        <div className={filterStyles.rows}>
          {rows.map((row) => {
            const field = fields.find((f) => f.key === row.field);
            if (!field) return null;
            const Icon = field.icon;
            return (
              <div className={filterStyles.row} key={row.id}>
                <span className={filterStyles.field}>
                  <Icon size={15} aria-hidden="true" />
                  <span className={filterStyles.fieldName}>{field.label}</span>
                </span>
                <select
                  className={filterStyles.control}
                  aria-label={`Phép so cho ${field.label}`}
                  value={row.op}
                  disabled={field.kind === "range"}
                  onChange={(event) => update(row.id, { op: event.target.value as ListFilterRow["op"] })}
                >
                  {field.kind === "range" ? (
                    <option value="is">trong khoảng</option>
                  ) : (
                    <>
                      <option value="is">là</option>
                      <option value="isNot">không phải</option>
                    </>
                  )}
                </select>
                {field.kind === "multi" ? (
                  <MultiValueSelect
                    label={field.label}
                    options={field.options ?? []}
                    values={row.values}
                    onChange={(values) => update(row.id, { values })}
                  />
                ) : (
                  <div className={filterStyles.range}>
                    <input
                      className={filterStyles.control}
                      type="number"
                      min={0}
                      placeholder="Từ"
                      aria-label={`${field.label} từ`}
                      value={row.from}
                      onChange={(event) => update(row.id, { from: event.target.value })}
                    />
                    <span className={filterStyles.rangeDash} aria-hidden="true">–</span>
                    <input
                      className={filterStyles.control}
                      type="number"
                      min={0}
                      placeholder="Đến"
                      aria-label={`${field.label} đến`}
                      value={row.to}
                      onChange={(event) => update(row.id, { to: event.target.value })}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className={filterStyles.remove}
                  aria-label={`Bỏ điều kiện ${field.label}`}
                  onClick={() => onRowsChange(rows.filter((r) => r.id !== row.id))}
                >
                  <Minus size={16} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className={filterStyles.addWrap} ref={addRef}>
        <button
          type="button"
          className={filterStyles.add}
          disabled={unused.length === 0}
          aria-expanded={addOpen}
          onClick={() => setAddOpen((open) => !open)}
        >
          <Plus size={16} aria-hidden="true" /> Thêm điều kiện
        </button>
        {addOpen && unused.length > 0 && (
          <div className={filterStyles.addMenu} role="menu">
            {unused.map((field) => (
              <button
                key={field.key}
                type="button"
                role="menuitem"
                className={filterStyles.option}
                onClick={() => {
                  onRowsChange([...rows, newRow(field.key)]);
                  setAddOpen(false);
                }}
              >
                <field.icon size={15} aria-hidden="true" /> {field.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={filterStyles.foot}>
        <span className={filterStyles.footNote}>
          {activeFilterCount(rows, fields)} điều kiện đang áp dụng · {resultCount} {itemLabel} khớp
        </span>
        <button
          type="button"
          className={filterStyles.ghost}
          onClick={() => onRowsChange(defaultFilterRows(fields.slice(0, 2).map((f) => f.key)))}
        >
          <RotateCcw size={15} aria-hidden="true" /> Đặt lại
        </button>
      </div>
    </div>
  );
}

export function CommerceListToolbar<T, K extends string>({
  query,
  onQueryChange,
  searchLabel,
  placeholder,
  sort,
  sortOptions,
  onSortChange,
  fields,
  rows,
  mode,
  onRowsChange,
  onModeChange,
  resultCount,
  itemLabel,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  searchLabel: string;
  placeholder: string;
  sort: K;
  sortOptions: ReadonlyArray<SortOption<K>>;
  onSortChange: (sort: K) => void;
  fields: ListFilterField<T>[];
  rows: ListFilterRow[];
  mode: MatchMode;
  onRowsChange: (rows: ListFilterRow[]) => void;
  onModeChange: (mode: MatchMode) => void;
  resultCount: number;
  itemLabel: string;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const filterRef = useCloseOnOutside(filterOpen, () => setFilterOpen(false));
  const sortRef = useCloseOnOutside(sortOpen, () => setSortOpen(false));
  const count = activeFilterCount(rows, fields);

  return (
    <div className={listStyles.toolbar}>
      <div className={listStyles.search}>
        <Search size={16} aria-hidden="true" className={listStyles.searchIcon} />
        <input
          className={listStyles.searchInput}
          type="search"
          aria-label={searchLabel}
          placeholder={placeholder}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div className={listStyles.anchor} ref={sortRef}>
        <button
          type="button"
          className={listStyles.iconBtn}
          aria-label="Sắp xếp danh sách"
          aria-expanded={sortOpen}
          onClick={() => setSortOpen((open) => !open)}
        >
          <ArrowUpDown size={16} aria-hidden="true" />
        </button>
        {sortOpen && (
          <div className={listStyles.sortMenu} role="menu">
            {sortOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                role="menuitem"
                className={`${listStyles.sortItem} ${sort === option.key ? listStyles.sortItemOn : ""}`}
                onClick={() => {
                  onSortChange(option.key);
                  setSortOpen(false);
                }}
              >
                <Check size={14} aria-hidden="true" style={{ opacity: sort === option.key ? 1 : 0 }} />
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={listStyles.anchor} ref={filterRef}>
        <button
          type="button"
          className={`${listStyles.iconBtn} ${count > 0 ? listStyles.iconBtnOn : ""}`}
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen((open) => !open)}
        >
          <Filter size={16} aria-hidden="true" /> Bộ lọc
          {count > 0 && <span className={listStyles.count}>{count}</span>}
        </button>
        {filterOpen && (
          <div className={listStyles.pop}>
            <FilterBuilder
              fields={fields}
              rows={rows}
              mode={mode}
              onRowsChange={onRowsChange}
              onModeChange={onModeChange}
              resultCount={resultCount}
              itemLabel={itemLabel}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function pageNumbers(current: number, total: number): Array<number | "gap"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const numbers = [...new Set([1, total, current, current - 1, current + 1])]
    .filter((number) => number >= 1 && number <= total)
    .sort((a, b) => a - b);
  const result: Array<number | "gap"> = [];
  let previous = 0;
  for (const number of numbers) {
    if (previous && number - previous > 1) result.push("gap");
    result.push(number);
    previous = number;
  }
  return result;
}

export function CommercePager({
  page,
  pageSize,
  total,
  itemLabel,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  if (total === 0) return null;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, lastPage);
  const first = (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, total);
  return (
    <div className={listStyles.pager}>
      <span className={listStyles.pagerInfo}>
        Hiện {first}–{last} trong <strong>{total}</strong> {itemLabel}
      </span>
      <label className={listStyles.perPage}>
        Mỗi trang
        <select
          className={listStyles.perPageSelect}
          aria-label="Số dòng mỗi trang"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {[10, 20, 50, 100].map((size) => (
            <option key={size} value={size}>{size} dòng</option>
          ))}
        </select>
      </label>
      <nav className={listStyles.pages} aria-label="Phân trang">
        <button
          type="button"
          className={listStyles.page}
          aria-label="Trang trước"
          disabled={current === 1}
          onClick={() => onPageChange(current - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        {pageNumbers(current, lastPage).map((number, index) => number === "gap" ? (
          <span key={`gap-${index}`} className={listStyles.gap} aria-hidden="true">…</span>
        ) : (
          <button
            key={number}
            type="button"
            className={`${listStyles.page} ${number === current ? listStyles.pageOn : ""}`}
            aria-label={`Trang ${number}`}
            aria-current={number === current ? "page" : undefined}
            onClick={() => onPageChange(number)}
          >
            {number}
          </button>
        ))}
        <button
          type="button"
          className={listStyles.page}
          aria-label="Trang sau"
          disabled={current === lastPage}
          onClick={() => onPageChange(current + 1)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}
