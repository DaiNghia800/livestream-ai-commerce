"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  FilePlus2,
  FileSpreadsheet,
  Filter,
  History,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Search,
  TrendingDown,
  TrendingUp,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import {
  getInventoryAdjustments,
  type InventoryAdjustment,
  type InventoryAdjustmentPage,
  type InventoryMovementType,
} from "./api/inventory";
import styles from "./inventory.module.css";

type Action = "reserve" | "adjust" | "release" | "deduct";

const ACTION_BY_MOVEMENT: Record<InventoryMovementType, Action> = {
  reserve: "reserve",
  adjustment: "adjust",
  release: "release",
  consume: "deduct",
};
const MOVEMENT_BY_ACTION: Record<Action, InventoryMovementType> = {
  reserve: "reserve",
  adjust: "adjustment",
  release: "release",
  deduct: "consume",
};
const ACTION_LABEL: Record<Action, string> = {
  reserve: "AI Giữ chỗ (Reserve)",
  adjust: "Điều chỉnh thủ công",
  release: "Hoàn tồn (Release)",
  deduct: "Xuất kho (Deduct)",
};
const ACTION_SOURCE: Record<Action, string> = {
  reserve: "Giữ chỗ cho đơn hàng",
  adjust: "Điều chỉnh tồn kho",
  release: "Hoàn giữ chỗ",
  deduct: "Xuất kho giao vận",
};

const QUICK_FILTERS: { id: "all" | Action; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "reserve", label: "Giữ chỗ" },
  { id: "release", label: "Hoàn tồn" },
  { id: "deduct", label: "Xuất kho" },
  { id: "adjust", label: "Điều chỉnh" },
];

const PAGE_SIZES = [20, 50, 100];

function timeRange(filter: string): { from?: string; to?: string } {
  const now = new Date();
  if (filter === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString() };
  }
  if (filter === "7d" || filter === "30d") {
    const days = filter === "7d" ? 7 : 30;
    return { from: new Date(now.getTime() - days * 86_400_000).toISOString() };
  }
  return {};
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function describe(event: InventoryAdjustment) {
  const action = ACTION_BY_MOVEMENT[event.movementType];
  const totalBefore = event.onHandAfter - event.delta;
  const reservedBefore = event.heldAfter - event.heldDelta;
  const changes: { text: string; tone: "negative" | "positive" | "reserved" | "released" | "deducted" }[] = [];
  if (event.delta !== 0) {
    changes.push({
      text: `${formatSigned(event.delta)} Tồn`,
      tone: event.delta > 0 ? "positive" : "negative",
    });
  }
  if (event.heldDelta !== 0) {
    changes.push({
      text: `${formatSigned(event.heldDelta)} Giữ chỗ`,
      tone: event.heldDelta > 0 ? "reserved" : "released",
    });
  }
  return {
    action,
    changes,
    totalBefore,
    reservedBefore,
    availableBefore: totalBefore - reservedBefore,
    availableAfter: event.onHandAfter - event.heldAfter,
  };
}

export function InventoryHistory({ initialSkuId }: { initialSkuId?: string }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<"all" | Action>("all");
  const [timeFilter, setTimeFilter] = useState("all");
  const [skuId, setSkuId] = useState(initialSkuId ?? "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<InventoryAdjustmentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    getInventoryAdjustments(
      {
        q: debouncedQuery || undefined,
        skuId: skuId || undefined,
        movementType: actionFilter === "all" ? undefined : MOVEMENT_BY_ACTION[actionFilter],
        ...timeRange(timeFilter),
        page,
        pageSize,
      },
      controller.signal,
    )
      .then((data) => {
        setResult(data);
        setError("");
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Không thể tải nhật ký tồn kho.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedQuery, skuId, actionFilter, timeFilter, page, pageSize]);

  const events = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const summary = result?.summary;

  function resetFilters() {
    setQuery("");
    setDebouncedQuery("");
    setActionFilter("all");
    setTimeFilter("all");
    setSkuId("");
    setPage(1);
    setNotice("Đã đặt lại bộ lọc nhật ký.");
  }

  function exportEvents() {
    const rows = [
      ["Thời gian", "Sản phẩm", "SKU", "Biến thể", "Loại", "Thay đổi tồn", "Thay đổi giữ chỗ", "Tồn sau", "Giữ chỗ sau", "Lý do", "Ghi chú", "Người xử lý"],
      ...events.map((event) => [
        new Date(event.createdAt).toLocaleString("vi-VN"),
        event.productName,
        event.skuCode,
        event.variantName,
        ACTION_LABEL[ACTION_BY_MOVEMENT[event.movementType]],
        event.delta,
        event.heldDelta,
        event.onHandAfter,
        event.heldAfter,
        event.reason,
        event.note ?? "",
        event.createdBy ?? "Hệ thống",
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory-history.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice(`Đã xuất ${events.length} bản ghi nhật ký.`);
  }

  return (
    <div className={styles.historyPage}>
      <section className={styles.historyHeader} aria-labelledby="history-title">
        <div className={styles.historyHeading}>
          <span className={styles.historyTitleIcon} aria-hidden="true">
            <History size={21} />
          </span>
          <div>
            <div className={styles.historyTitleLine}>
              <h1 id="history-title">Nhật ký Biến động Tồn kho &amp; Audit Log</h1>
            </div>
            <p>
              Truy vết chi tiết từng biến động số lượng tồn kho: giữ chỗ, hoàn tồn,
              xuất kho và điều chỉnh thủ công.
            </p>
          </div>
        </div>
        <div className={styles.historyHeaderActions}>
          <button
            className={styles.historySecondaryButton}
            onClick={() =>
              document.getElementById("inventory-history-filters")?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              })
            }
            type="button"
          >
            <Filter size={15} aria-hidden="true" />
            Bộ lọc nâng cao
          </button>
          <button
            className={styles.historySecondaryButton}
            disabled={events.length === 0}
            onClick={exportEvents}
            type="button"
          >
            <FileSpreadsheet size={15} aria-hidden="true" />
            Xuất dữ liệu Excel/CSV
          </button>
          <Link className={styles.historyPrimaryButton} href="/shop/inventory/adjustment">
            <FilePlus2 size={15} aria-hidden="true" />
            Tạo phiếu điều chỉnh
          </Link>
        </div>
      </section>

      {notice && (
        <p className={styles.historyNotice} role="status">
          <CheckCircle2 size={14} aria-hidden="true" />
          {notice}
          <button aria-label="Đóng thông báo" onClick={() => setNotice("")} type="button">
            <X size={14} aria-hidden="true" />
          </button>
        </p>
      )}
      {error && (
        <p className={styles.historyNotice} role="alert">
          {error}
        </p>
      )}

      <section className={styles.historyKpis} aria-label="Tổng quan biến động kho">
        <article className={styles.historyKpi}>
          <div className={styles.historyKpiTop}>
            <span>Tổng lượt biến động (theo bộ lọc)</span>
            <span className={styles.historyKpiIcon}><RefreshCw size={17} aria-hidden="true" /></span>
          </div>
          <div className={styles.historyKpiValue}>
            {(summary?.movementCount ?? 0).toLocaleString("vi-VN")} <small>lượt biến động</small>
          </div>
          <span className={`${styles.historyKpiAccent} ${styles.accentPrimary}`} />
        </article>
        <article className={`${styles.historyKpi} ${styles.deductKpi}`}>
          <div className={styles.historyKpiTop}>
            <span>Tổng số lượng tăng tồn</span>
            <span className={styles.historyKpiIcon}><TrendingUp size={17} aria-hidden="true" /></span>
          </div>
          <div className={styles.historyKpiValue}>
            {(summary?.totalIncrease ?? 0).toLocaleString("vi-VN")} <small>sản phẩm</small>
          </div>
          <span className={`${styles.historyKpiAccent} ${styles.accentBlue}`} />
        </article>
        <article className={`${styles.historyKpi} ${styles.releaseKpi}`}>
          <div className={styles.historyKpiTop}>
            <span>Tổng số lượng giảm tồn</span>
            <span className={styles.historyKpiIcon}><TrendingDown size={17} aria-hidden="true" /></span>
          </div>
          <div className={styles.historyKpiValue}>
            {(summary?.totalDecrease ?? 0).toLocaleString("vi-VN")} <small>sản phẩm</small>
          </div>
          <span className={`${styles.historyKpiAccent} ${styles.accentAmber}`} />
        </article>
      </section>

      <section
        className={styles.historyFilters}
        id="inventory-history-filters"
        aria-label="Bộ lọc nhật ký tồn kho"
      >
        <div className={styles.historyFilterGrid}>
          <label className={`${styles.historyField} ${styles.historySearchField}`}>
            <span>TÌM KIẾM CHI TIẾT</span>
            <div>
              <Search size={15} aria-hidden="true" />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Mã SKU, tên sản phẩm, lý do..."
                type="search"
                value={query}
              />
            </div>
          </label>
          <label className={styles.historyField}>
            <span>LOẠI HÀNH ĐỘNG BIẾN ĐỘNG</span>
            <div>
              <select
                aria-label="Loại hành động biến động"
                onChange={(event) => {
                  setActionFilter(event.target.value as "all" | Action);
                  setPage(1);
                }}
                value={actionFilter}
              >
                <option value="all">Tất cả hành động</option>
                <option value="reserve">AI Giữ chỗ (Hold / Reserve)</option>
                <option value="release">Hoàn tồn (Release)</option>
                <option value="deduct">Xuất kho (Deduct)</option>
                <option value="adjust">Điều chỉnh thủ công (Manual Adjustment)</option>
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
          </label>
          <label className={styles.historyField}>
            <span>THỜI GIAN</span>
            <div>
              <select
                aria-label="Khoảng thời gian"
                onChange={(event) => {
                  setTimeFilter(event.target.value);
                  setPage(1);
                }}
                value={timeFilter}
              >
                <option value="all">Toàn bộ thời gian</option>
                <option value="today">Hôm nay</option>
                <option value="7d">7 ngày qua</option>
                <option value="30d">30 ngày qua</option>
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
          </label>
        </div>
        <div className={styles.quickFilters}>
          {QUICK_FILTERS.map((filter) => (
            <button
              aria-pressed={actionFilter === filter.id}
              className={`${styles.quickFilter} ${styles[`quick-${filter.id}`]} ${actionFilter === filter.id ? styles.quickActive : ""}`}
              key={filter.id}
              onClick={() => {
                setActionFilter(filter.id);
                setPage(1);
              }}
              type="button"
            >
              {filter.id !== "all" && <span aria-hidden="true" />}
              <span>{filter.label}</span>
            </button>
          ))}
          {skuId && (
            <button className={styles.resetHistoryButton} onClick={() => setSkuId("")} type="button">
              <X size={13} aria-hidden="true" />
              Bỏ lọc theo SKU
            </button>
          )}
          <button className={styles.resetHistoryButton} onClick={resetFilters} type="button">
            <RotateCcw size={13} aria-hidden="true" />
            Đặt lại mặc định
          </button>
        </div>
      </section>

      <section className={styles.auditCard} aria-label="Danh sách nhật ký kiểm kê">
        <div className={styles.auditTableWrap}>
          <table className={styles.auditTable}>
            <caption className="sr-only">
              Nhật ký biến động số lượng tồn kho, hành động, nguồn phát sinh và tác nhân xử lý
            </caption>
            <thead>
              <tr>
                <th>THỜI GIAN</th>
                <th>SẢN PHẨM &amp; MÃ SKU</th>
                <th>BIẾN ĐỘNG SỐ LƯỢNG</th>
                <th>TỒN TRƯỚC → SAU (TOT / RES / AVAIL)</th>
                <th>LOẠI HÀNH ĐỘNG</th>
                <th>NGUỒN &amp; LÝ DO</th>
                <th>TÁC NHÂN XỬ LÝ</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const info = describe(event);
                const date = new Date(event.createdAt);
                return (
                  <tr className={styles[`event-${info.action}`]} key={event.id}>
                    <td className={styles.eventTime}>
                      <span aria-hidden="true" />
                      <strong>{date.toLocaleTimeString("vi-VN")}</strong>
                      <small>{date.toLocaleDateString("vi-VN")}</small>
                    </td>
                    <td className={styles.eventProduct}>
                      <strong>{event.productName}</strong>
                      <small>
                        SKU: {event.skuCode} · {event.variantName}
                      </small>
                    </td>
                    <td className={styles.eventChanges}>
                      {info.changes.map((change) => (
                        <span className={styles[`change-${change.tone}`]} key={change.text}>
                          {change.text}
                        </span>
                      ))}
                    </td>
                    <td className={styles.eventStock}>
                      <span>
                        Tồn: {info.totalBefore} → <strong>{event.onHandAfter}</strong>
                      </span>
                      <small>
                        Res: {info.reservedBefore} → <b>{event.heldAfter}</b>
                        {" | "}
                        Avail: {info.availableBefore} → <b>{info.availableAfter}</b>
                      </small>
                    </td>
                    <td>
                      <span className={`${styles.actionBadge} ${styles[`action-${info.action}`]}`}>
                        <span aria-hidden="true" />
                        {ACTION_LABEL[info.action]}
                      </span>
                    </td>
                    <td className={styles.eventSource}>
                      <strong>{event.reason || ACTION_SOURCE[info.action]}</strong>
                      <small>
                        {info.action === "reserve" ? <Bot size={12} aria-hidden="true" /> : null}
                        {info.action === "adjust" ? <PackageCheck size={12} aria-hidden="true" /> : null}
                        {info.action === "release" ? <Clock3 size={12} aria-hidden="true" /> : null}
                        {info.action === "deduct" ? <Truck size={12} aria-hidden="true" /> : null}
                        {event.note ?? ACTION_SOURCE[info.action]}
                      </small>
                    </td>
                    <td className={styles.eventActor}>
                      <span className={styles[`actor-${info.action}`]}>
                        <UserRound size={13} aria-hidden="true" />
                        {event.createdBy ?? "Hệ thống"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!loading && events.length === 0 && (
                <tr>
                  <td className={styles.auditEmpty} colSpan={7}>
                    Không tìm thấy bản ghi phù hợp với bộ lọc.
                  </td>
                </tr>
              )}
              {loading && events.length === 0 && (
                <tr>
                  <td className={styles.auditEmpty} colSpan={7}>
                    Đang tải nhật ký...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className={styles.auditFooter}>
          <div className={styles.auditPaginationInfo}>
            <span>Hiển thị</span>
            <select
              aria-label="Số bản ghi mỗi trang"
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              value={pageSize}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>
              trên tổng số <strong>{total.toLocaleString("vi-VN")}</strong> bản ghi biến động
            </span>
            <i aria-hidden="true">|</i>
            <span>
              Trang <strong>{page}</strong> trên <strong>{totalPages}</strong> trang
            </span>
          </div>
          <nav className={styles.auditPagination} aria-label="Phân trang nhật ký">
            <button aria-label="Trang đầu" disabled={page <= 1} onClick={() => setPage(1)} type="button">
              <ChevronsLeft size={14} />
            </button>
            <button aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage(page - 1)} type="button">
              <ChevronLeft size={14} />
            </button>
            <button aria-current="page" type="button">{page}</button>
            <button aria-label="Trang sau" disabled={page >= totalPages} onClick={() => setPage(page + 1)} type="button">
              <ChevronRight size={14} />
            </button>
            <button aria-label="Trang cuối" disabled={page >= totalPages} onClick={() => setPage(totalPages)} type="button">
              <ChevronsRight size={14} />
            </button>
          </nav>
        </footer>
      </section>

      <div className={styles.historyBackLink}>
        <Link href="/shop/inventory"><ArrowLeft size={14} aria-hidden="true" /> Quay lại quản lý tồn kho</Link>
      </div>
    </div>
  );
}
