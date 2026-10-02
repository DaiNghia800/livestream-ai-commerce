"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  CalendarDays,
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
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Truck,
  UserRound,
  Wifi,
  X,
} from "lucide-react";
import styles from "./inventory.module.css";

type InventoryEvent = {
  id: string;
  time: string;
  milliseconds: string;
  transaction: string;
  channel: string;
  product: string;
  sku: string;
  changes: { text: string; tone: "negative" | "positive" | "reserved" | "released" | "deducted" }[];
  totalBefore: number;
  totalAfter: number;
  reservedBefore: number;
  reservedAfter: number;
  availableBefore: number;
  availableAfter: number;
  action: "reserve" | "adjust" | "release" | "deduct";
  actionLabel: string;
  source: string;
  sourceDetail: string;
  actor: string;
};

const auditEvents: InventoryEvent[] = [
  {
    id: "evt-9942",
    time: "14:32:18",
    milliseconds: ".410",
    transaction: "#ORD-9942",
    channel: "TikTok Live Stream",
    product: "Áo Sơ Mi Linen Cổ Tàu - Trắng M",
    sku: "AO01-WHT-M",
    changes: [
      { text: "-2 Khả dụng (Avail)", tone: "negative" },
      { text: "+2 Giữ chỗ (Reserved)", tone: "reserved" },
    ],
    totalBefore: 50,
    totalAfter: 50,
    reservedBefore: 0,
    reservedAfter: 2,
    availableBefore: 50,
    availableAfter: 48,
    action: "reserve",
    actionLabel: "AI GIỮ CHỖ LIVE",
    source: 'Khách chốt "AO01 trắng M x2"',
    sourceDetail: "Khách: @nguyenan_88 (SĐT OK)",
    actor: "Google Gemini AI Bot",
  },
  {
    id: "evt-adj-0842",
    time: "14:30:05",
    milliseconds: ".112",
    transaction: "#ADJ-2025-0842",
    channel: "Phiếu kho thủ công",
    product: "Áo Sơ Mi Linen Cổ Tàu - Trắng M",
    sku: "AO01-WHT-M",
    changes: [
      { text: "+2 Tổng kho (Total)", tone: "positive" },
      { text: "+2 Khả dụng (Avail)", tone: "positive" },
    ],
    totalBefore: 48,
    totalAfter: 50,
    reservedBefore: 0,
    reservedAfter: 0,
    availableBefore: 48,
    availableAfter: 50,
    action: "adjust",
    actionLabel: "ĐIỀU CHỈNH THỦ CÔNG",
    source: "Kiểm đếm bù hàng mẫu",
    sourceDetail: "Kho Tổng Tân Bình - Kệ A3",
    actor: "Thủ kho Tuấn Trần",
  },
  {
    id: "evt-9925",
    time: "14:15:00",
    milliseconds: ".004",
    transaction: "#ORD-9925",
    channel: "Facebook Live",
    product: "Váy Đầm Linen Dáng Suông - Kem",
    sku: "VA03-BEI-F",
    changes: [
      { text: "+1 Khả dụng (Avail)", tone: "positive" },
      { text: "-1 Giữ chỗ (Released)", tone: "released" },
    ],
    totalBefore: 18,
    totalAfter: 18,
    reservedBefore: 1,
    reservedAfter: 0,
    availableBefore: 17,
    availableAfter: 18,
    action: "release",
    actionLabel: "TỰ ĐỘNG HOÀN TỒN",
    source: "Khách quá hạn 15p không xác nhận",
    sourceDetail: "Hủy giữ chỗ tự động (Expired)",
    actor: "System Auto-Release",
  },
  {
    id: "evt-9910",
    time: "13:58:40",
    milliseconds: ".890",
    transaction: "#ORD-9910",
    channel: "Vận đơn: GHTK-8849102",
    product: "Quần Ống Suông Linen - Đen 30",
    sku: "QU02-BLK-30",
    changes: [
      { text: "-1 Tổng kho (Total)", tone: "negative" },
      { text: "-1 Giữ chỗ (Reserved)", tone: "deducted" },
    ],
    totalBefore: 142,
    totalAfter: 141,
    reservedBefore: 3,
    reservedAfter: 2,
    availableBefore: 139,
    availableAfter: 139,
    action: "deduct",
    actionLabel: "XUẤT KHO GIAO VẬN",
    source: "Bàn giao bưu tá GHTK",
    sourceDetail: "Đã in vận đơn & dán tem",
    actor: "GHN/GHTK Sync Webhook",
  },
  {
    id: "evt-9904",
    time: "13:45:12",
    milliseconds: ".248",
    transaction: "#ORD-9904",
    channel: "Phiên Live #LIVE-2025-08",
    product: "Áo Blazer Linen 1 Lớp - Nâu L",
    sku: "BZ05-BRN-L",
    changes: [
      { text: "-1 Khả dụng (Avail)", tone: "negative" },
      { text: "+1 Giữ chỗ (Reserved)", tone: "reserved" },
    ],
    totalBefore: 120,
    totalAfter: 120,
    reservedBefore: 0,
    reservedAfter: 1,
    availableBefore: 120,
    availableAfter: 119,
    action: "reserve",
    actionLabel: "AI GIỮ CHỖ LIVE",
    source: "Bình luận từ phiên live #LIVE-2025-08",
    sourceDetail: 'Cú pháp: "BZ05 Nâu L chốt 1 áo"',
    actor: "Google Gemini AI Bot",
  },
];

const quickFilters = [
  { id: "all", label: "Tất cả sự kiện", count: "3.680" },
  { id: "reserve", label: "Chỉ xem AI Live Reserve", count: "1.150" },
  { id: "release", label: "Hoàn tồn tự động", count: "185" },
  { id: "adjust", label: "Phiếu chỉnh thủ kho", count: "42" },
] as const;

export function InventoryHistory() {
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("today");
  const [quickFilter, setQuickFilter] = useState("all");
  const [notice, setNotice] = useState("");

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("vi");
    return auditEvents.filter((event) => {
      const matchesQuery =
        !normalizedQuery ||
        [
          event.transaction,
          event.product,
          event.sku,
          event.channel,
          event.source,
          event.sourceDetail,
          event.actor,
        ].some((value) => value.toLocaleLowerCase("vi").includes(normalizedQuery));
      const matchesAction =
        actionFilter === "all" || event.action === actionFilter;
      const matchesSource =
        sourceFilter === "all" ||
        (sourceFilter === "live" && event.action === "reserve") ||
        (sourceFilter === "admin" && event.action === "adjust") ||
        (sourceFilter === "cron" && event.action === "release") ||
        (sourceFilter === "shipper" && event.action === "deduct");
      const matchesQuick = quickFilter === "all" || event.action === quickFilter;
      return matchesQuery && matchesAction && matchesSource && matchesQuick;
    });
  }, [actionFilter, query, quickFilter, sourceFilter]);

  function resetFilters() {
    setQuery("");
    setActionFilter("all");
    setSourceFilter("all");
    setTimeFilter("today");
    setQuickFilter("all");
  }

  function exportEvents() {
    const header = [
      "Thời gian",
      "Mã giao dịch",
      "Sản phẩm",
      "SKU",
      "Hành động",
      "Nguồn",
      "Tác nhân",
      "Tồn trước",
      "Tồn sau",
    ];
    const rows = filteredEvents.map((event) => [
      `${event.time}${event.milliseconds}`,
      event.transaction,
      event.product,
      event.sku,
      event.actionLabel,
      event.source,
      event.actor,
      event.totalBefore,
      event.totalAfter,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
    const file = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nhat-ky-bien-dong-ton-kho.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice(`Đã xuất ${filteredEvents.length} bản ghi nhật ký.`);
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
              <span className={styles.realtimeBadge}>
                <span aria-hidden="true" />
                Realtime Stream
              </span>
            </div>
            <p>
              Truy vết chi tiết từng biến động số lượng tồn kho theo thời gian
              thực từ bình luận Livestream, thanh toán, đóng gói và kiểm kê kho
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
          <button
            aria-label="Đóng thông báo"
            onClick={() => setNotice("")}
            type="button"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </p>
      )}

      <section className={styles.historyKpis} aria-label="Tổng quan biến động kho">
        <article className={styles.historyKpi}>
          <div className={styles.historyKpiTop}>
            <span>Tổng giao dịch kho hôm nay</span>
            <span className={styles.historyKpiIcon}><RefreshCw size={17} aria-hidden="true" /></span>
          </div>
          <div className={styles.historyKpiValue}>1.840 <small>lượt biến động</small></div>
          <div className={styles.historyKpiFooter}><strong>↗ +12.8%</strong> so với cùng giờ phiên trước</div>
          <span className={`${styles.historyKpiAccent} ${styles.accentPrimary}`} />
        </article>
        <article className={`${styles.historyKpi} ${styles.reserveKpi}`}>
          <div className={styles.historyKpiTop}>
            <span>AI Giữ chỗ từ Chat Live</span>
            <span className={styles.historyKpiIcon}><LockKeyhole size={17} aria-hidden="true" /></span>
          </div>
          <div className={styles.historyKpiValue}>1.150 <small>lượt (Reserved)</small></div>
          <div className={styles.historyKpiFooter}><strong>↗ +24%</strong> tốc độ xử lý bot 0.18s/comment</div>
          <span className={`${styles.historyKpiAccent} ${styles.accentPurple}`} />
        </article>
        <article className={`${styles.historyKpi} ${styles.releaseKpi}`}>
          <div className={styles.historyKpiTop}>
            <span>Hoàn tồn hủy / Quá hạn 15p</span>
            <span className={styles.historyKpiIcon}><RotateCcw size={17} aria-hidden="true" /></span>
          </div>
          <div className={styles.historyKpiValue}>185 <small>lượt (Released)</small></div>
          <div className={styles.historyKpiFooter}><strong>✓ An toàn</strong> Tồn ảo chỉ 2.8% (Dưới ngưỡng 3%)</div>
          <span className={`${styles.historyKpiAccent} ${styles.accentAmber}`} />
        </article>
        <article className={`${styles.historyKpi} ${styles.deductKpi}`}>
          <div className={styles.historyKpiTop}>
            <span>Xuất kho giao vận bưu tá</span>
            <span className={styles.historyKpiIcon}><Truck size={17} aria-hidden="true" /></span>
          </div>
          <div className={styles.historyKpiValue}>505 <small>lượt (Deducted)</small></div>
          <div className={styles.historyKpiFooter}><strong>▣ Đã đồng bộ</strong> Tự động trừ Total tồn kho</div>
          <span className={`${styles.historyKpiAccent} ${styles.accentBlue}`} />
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
                placeholder="Mã SKU, Tên SP, #ORD-xxxx, #ADJ-xxxx..."
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
                onChange={(event) => setActionFilter(event.target.value)}
                value={actionFilter}
              >
                <option value="all">Tất cả hành động (Hold, Release, Deduct...)</option>
                <option value="reserve">AI Giữ chỗ (Hold / Reserve)</option>
                <option value="release">Hoàn tồn (Release)</option>
                <option value="deduct">Bán hoàn tất (Deduct / Shipped)</option>
                <option value="adjust">Điều chỉnh thủ công (Manual Adjustment)</option>
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
          </label>
          <label className={styles.historyField}>
            <span>KHO / NGUỒN PHÁT SINH</span>
            <div>
              <select
                aria-label="Kho hoặc nguồn phát sinh"
                onChange={(event) => setSourceFilter(event.target.value)}
                value={sourceFilter}
              >
                <option value="all">Tất cả nguồn phát sinh</option>
                <option value="live">Livestream Chat Engine</option>
                <option value="admin">Web Admin thủ công</option>
                <option value="cron">Hệ thống tự động hết hạn (15p Cron)</option>
                <option value="shipper">Bưu cục GHN/GHTK Sync Webhook</option>
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
          </label>
          <label className={styles.historyField}>
            <span>THỜI GIAN</span>
            <div>
              <select
                aria-label="Khoảng thời gian"
                onChange={(event) => setTimeFilter(event.target.value)}
                value={timeFilter}
              >
                <option value="today">Hôm nay (00:00 - 23:59)</option>
                <option value="7days">7 ngày qua</option>
                <option value="30days">30 ngày qua</option>
                <option value="custom">Khoảng tùy chỉnh...</option>
              </select>
              <CalendarDays size={14} aria-hidden="true" />
            </div>
          </label>
        </div>
        <div className={styles.quickFilters} aria-label="Phím lọc nhanh">
          <span className={styles.quickFilterLabel}>Phím lọc nhanh:</span>
          {quickFilters.map((filter) => (
            <button
              aria-pressed={quickFilter === filter.id}
              className={`${styles.quickFilter} ${styles[`quick-${filter.id}`]} ${quickFilter === filter.id ? styles.quickActive : ""}`}
              key={filter.id}
              onClick={() => setQuickFilter(filter.id)}
              type="button"
            >
              {filter.id !== "all" && <span aria-hidden="true" />}
              {filter.label}
              <small>{filter.count}</small>
            </button>
          ))}
          <button className={styles.resetHistoryButton} onClick={resetFilters} type="button">
            <RotateCcw size={13} aria-hidden="true" />
            Đặt lại mặc định
          </button>
        </div>
      </section>

      <section className={styles.auditCard} aria-label="Danh sách nhật ký kiểm kê">
        <div className={styles.auditStreamBar}>
          <div className={styles.auditStreamStatus}>
            <span aria-hidden="true" />
            Audit Stream: Đang nhận tín hiệu trực tiếp từ Livestream #LIVE-2025-08
          </div>
          <div className={styles.auditStreamDetails}>
            <span>Tốc độ ghi nhận: <strong>12 sự kiện/giây</strong></span>
            <i aria-hidden="true">|</i>
            <span>Tự động làm mới: <b>Bật (Mỗi 2s)</b></span>
          </div>
        </div>
        <div className={styles.auditTableWrap}>
          <table className={styles.auditTable}>
            <caption className="sr-only">
              Nhật ký biến động số lượng tồn kho, hành động, nguồn phát sinh và tác nhân xử lý
            </caption>
            <thead>
              <tr>
                <th>THỜI GIAN</th>
                <th>MÃ GD / ĐƠN HÀNG</th>
                <th>SẢN PHẨM &amp; MÃ SKU</th>
                <th>BIẾN ĐỘNG SỐ LƯỢNG</th>
                <th>TỒN TRƯỚC → SAU (TOT / RES / AVAIL)</th>
                <th>LOẠI HÀNH ĐỘNG</th>
                <th>NGUỒN &amp; LÝ DO</th>
                <th>TÁC NHÂN XỬ LÝ</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((event) => (
                <tr className={styles[`event-${event.action}`]} key={event.id}>
                  <td className={styles.eventTime}>
                    <span aria-hidden="true" />
                    <strong>{event.time}</strong>
                    <small>{event.milliseconds}</small>
                  </td>
                  <td className={styles.eventTransaction}>
                    <a href="#inventory-history-filters">{event.transaction}</a>
                    <small>{event.channel}</small>
                  </td>
                  <td className={styles.eventProduct}>
                    <strong>{event.product}</strong>
                    <small>SKU: {event.sku}</small>
                  </td>
                  <td className={styles.eventChanges}>
                    {event.changes.map((change) => (
                      <span
                        className={styles[`change-${change.tone}`]}
                        key={change.text}
                      >
                        {change.text}
                      </span>
                    ))}
                  </td>
                  <td className={styles.eventStock}>
                    <span>Tồn: {event.totalBefore} → <strong>{event.totalAfter}</strong></span>
                    <small>
                      Res: {event.reservedBefore} → <b>{event.reservedAfter}</b>
                      {" | "}
                      Avail: {event.availableBefore} → <b>{event.availableAfter}</b>
                    </small>
                  </td>
                  <td>
                    <span className={`${styles.actionBadge} ${styles[`action-${event.action}`]}`}>
                      <span aria-hidden="true" />
                      {event.actionLabel}
                    </span>
                  </td>
                  <td className={styles.eventSource}>
                    <strong>{event.source}</strong>
                    <small>
                      {event.action === "reserve" ? <Bot size={12} aria-hidden="true" /> : null}
                      {event.action === "adjust" ? <PackageCheck size={12} aria-hidden="true" /> : null}
                      {event.action === "release" ? <Clock3 size={12} aria-hidden="true" /> : null}
                      {event.action === "deduct" ? <Truck size={12} aria-hidden="true" /> : null}
                      {event.sourceDetail}
                    </small>
                  </td>
                  <td className={styles.eventActor}>
                    <span className={styles[`actor-${event.action}`]}>
                      {event.action === "reserve" ? <Bot size={13} aria-hidden="true" /> : null}
                      {event.action === "adjust" ? <UserRound size={13} aria-hidden="true" /> : null}
                      {event.action === "release" ? <Clock3 size={13} aria-hidden="true" /> : null}
                      {event.action === "deduct" ? <Wifi size={13} aria-hidden="true" /> : null}
                      {event.actor}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredEvents.length === 0 && (
                <tr>
                  <td className={styles.auditEmpty} colSpan={8}>
                    Không tìm thấy bản ghi phù hợp với bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className={styles.auditFooter}>
          <div className={styles.auditPaginationInfo}>
            <span>Hiển thị</span>
            <select aria-label="Số bản ghi mỗi trang" defaultValue="20">
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <span>trên tổng số <strong>3.680</strong> bản ghi biến động</span>
            <i aria-hidden="true">|</i>
            <span>Trang <strong>1</strong> trên <strong>184</strong> trang</span>
          </div>
          <nav className={styles.auditPagination} aria-label="Phân trang nhật ký">
            <button aria-label="Trang đầu" disabled type="button"><ChevronsLeft size={14} /></button>
            <button aria-label="Trang trước" disabled type="button"><ChevronLeft size={14} /></button>
            <button aria-current="page" type="button">1</button>
            <button type="button">2</button>
            <button type="button">3</button>
            <span>…</span>
            <button type="button">184</button>
            <button aria-label="Trang sau" type="button"><ChevronRight size={14} /></button>
            <button aria-label="Trang cuối" type="button"><ChevronsRight size={14} /></button>
          </nav>
        </footer>
      </section>

      <footer className={styles.auditLegend}>
        <div>
          <strong>Quy ước công thức kiểm toán:</strong>
          <span><i className={styles.legendTotal} /> <b>Total</b> (Tổng tồn thực tế) = Hàng vật lý còn trong kho</span>
          <span><i className={styles.legendReserved} /> <b>Reserved</b> (Đang giữ chỗ) = AI tạm giữ 15 phút cho khách Live</span>
          <span><i className={styles.legendAvailable} /> <b>Available</b> = Total - Reserved (Sẵn sàng bán tiếp)</span>
        </div>
        <p><ShieldCheck size={13} aria-hidden="true" /> Toàn bộ nhật ký được ký số bằng mã băm SHA-256 chống chỉnh sửa dữ liệu kho.</p>
      </footer>

      <div className={styles.historyBackLink}>
        <Link href="/shop/inventory"><ArrowLeft size={14} aria-hidden="true" /> Quay lại quản lý tồn kho</Link>
      </div>
    </div>
  );
}
