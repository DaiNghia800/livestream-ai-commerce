"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  Eye,
  FileText,
  Package,
  PackageCheck,
  Printer,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  Search,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { formatCountdown, formatMoney } from "@/lib/format";
import { ordersApi, type OrderDetail, type OrderListItem } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-now";
import { orderSources, orderStatuses } from "./labels";
import {
  apDung,
  demDieuKien,
  newRow,
  useDongKhiBamNgoai,
  OrderFilterBuilder,
  rowsMacDinh,
  type FilterRow,
  type MatchMode,
} from "./order-filter-builder";
import styles from "./merchant-order-list.module.css";
import zebra from "@/styles/zebra-table.module.css";
import { buildCsv, downloadCsv, tenTep } from "@/lib/export-csv";
import {
  GIOI_HAN_IN,
  moHopThoaiIn,
  PrintableOrders,
  taiChiTiet,
} from "./print-orders";

const LUU_KEY = "liveorder.order-filters.v1";

interface BoLocDaLuu {
  ten: string;
  mode: MatchMode;
  rows: FilterRow[];
}

/**
 * Dãy số trang để hiển thị, rút gọn bằng dấu ba chấm.
 *
 * Một phiên live vài trăm đơn chia 20 dòng là hơn chục trang — bày
 * hết ra thì thanh phân trang dài hơn cả bảng.
 */
function danhSachTrang(
  hienTai: number,
  tong: number,
): Array<number | "gap"> {
  if (tong <= 7) {
    return Array.from({ length: tong }, (_, i) => i + 1);
  }

  const ds = new Set<number>([1, tong, hienTai]);
  // Kèm một trang hai bên trang đang đứng để bấm qua lại cho nhanh.
  if (hienTai - 1 > 1) ds.add(hienTai - 1);
  if (hienTai + 1 < tong) ds.add(hienTai + 1);

  const sapXep = [...ds].sort((a, b) => a - b);
  const ketQua: Array<number | "gap"> = [];
  let truoc = 0;
  for (const t of sapXep) {
    if (truoc && t - truoc > 1) ketQua.push("gap");
    ketQua.push(t);
    truoc = t;
  }
  return ketQua;
}

/**
 * Những trạng thái không huỷ được nữa.
 *
 * Khai chung với trang chi tiết để hai nơi không lệch nhau — danh
 * sách cho bấm mà chi tiết lại chặn thì người dùng bấm vào ngõ cụt.
 */
export const KHONG_HUY_DUOC = ["COMPLETED", "CANCELLED", "EXPIRED"];

/** Giây còn lại của lượt giữ hàng, tính từ mốc backend trả về. */
function secondsLeft(heldUntil: string | null, now: number): number | null {
  if (!heldUntil) return null;
  return Math.max(0, Math.round((new Date(heldUntil).getTime() - now) / 1000));
}

/** Các kiểu sắp xếp bảng. */
const SAP_XEP = [
  { key: "newest", label: "Mới nhất trước" },
  { key: "oldest", label: "Cũ nhất trước" },
  { key: "expiring", label: "Sắp hết hạn giữ" },
  { key: "amountDesc", label: "Tiền cao → thấp" },
  { key: "amountAsc", label: "Tiền thấp → cao" },
] as const;

type SortKey = (typeof SAP_XEP)[number]["key"];

export function MerchantOrderList() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  // Mở sẵn bốn điều kiện hay dùng; chưa chọn giá trị nên chưa lọc gì.
  const [rows, setRows] = useState<FilterRow[]>(rowsMacDinh);
  const [mode, setMode] = useState<MatchMode>("ALL");
  const [daLuu, setDaLuu] = useState<BoLocDaLuu[]>([]);
  const [trang, setTrang] = useState(1);
  const [soDong, setSoDong] = useState(20);
  const [moLoc, setMoLoc] = useState(false);
  const [moSort, setMoSort] = useState(false);
  const [phieuIn, setPhieuIn] = useState<OrderDetail[]>([]);
  const [dangIn, setDangIn] = useState<string | null>(null);
  const [loiThaoTac, setLoiThaoTac] = useState<string | null>(null);

  // Tải MỘT lô rồi lọc tại chỗ. Bộ dựng điều kiện vượt xa những gì API
  // lọc được (chỉ trạng thái và nguồn), mà đẩy từng tổ hợp xuống server
  // thì mỗi lần sửa một điều kiện lại phải chờ mạng.
  const { data, loading, error, refreshing, reload } = useApi(
    () => ordersApi.list({ limit: 200 }),
    [],
  );
  const orders = useMemo(() => data ?? [], [data]);
  const now = useNow(orders.length > 0);

  // Bộ lọc đã lưu nằm ở localStorage: chưa có đăng nhập nên không có
  // chỗ nào trên server để gắn chúng vào một tài khoản.
  useEffect(() => {
    // Đọc trong setTimeout chứ không gọi thẳng trong thân effect: gọi
    // thẳng kích hoạt một vòng render nối tiếp, và localStorage không
    // tồn tại lúc render phía server nên cũng không khởi tạo sẵn được.
    const id = setTimeout(() => {
      try {
        const raw = localStorage.getItem(LUU_KEY);
        if (raw) setDaLuu(JSON.parse(raw) as BoLocDaLuu[]);
      } catch {
        // Trình duyệt chặn localStorage, hoặc dữ liệu cũ hỏng định
        // dạng. Mất bộ lọc đã lưu thì phiền, nhưng không được làm vỡ
        // cả trang.
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function ghiLai(ds: BoLocDaLuu[]) {
    setDaLuu(ds);
    try {
      localStorage.setItem(LUU_KEY, JSON.stringify(ds));
    } catch {
      /* xem lý do ở trên */
    }
  }

  // `now` bằng 0 ở lần render đầu (xem useNow). Truyền thẳng chứ không
  // lùi về Date.now(): gọi hàm không thuần khiết trong thân render thì
  // mỗi lần render ra một kết quả khác.
  const filtered = useMemo(() => {
    const key = query.toLocaleLowerCase("vi").trim();

    const ds = orders.filter((o) => {
      if (key) {
        const text = `${o.orderCode} ${o.recipientName ?? ""} ${o.recipientPhone ?? ""}`;
        if (!text.toLocaleLowerCase("vi").includes(key)) return false;
      }
      return apDung(rows, mode, o, now);
    });

    const mocGiu = (o: OrderListItem) =>
      o.heldUntil ? new Date(o.heldUntil).getTime() : Number.POSITIVE_INFINITY;

    // Sao chép trước khi sắp: sort() đổi tại chỗ, mà `orders` là dữ
    // liệu dùng chung cho mấy ô số liệu phía trên.
    return [...ds].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.createdAt.localeCompare(b.createdAt);
        case "expiring":
          return mocGiu(a) - mocGiu(b);
        case "amountDesc":
          return Number(b.totalAmount) - Number(a.totalAmount);
        case "amountAsc":
          return Number(a.totalAmount) - Number(b.totalAmount);
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
  }, [orders, rows, mode, now, query, sort]);

  const tongTrang = Math.max(1, Math.ceil(filtered.length / soDong));

  // Kẹp trang về khoảng hợp lệ ngay khi render thay vì sửa bằng effect:
  // lọc xong còn 3 đơn mà đang đứng ở trang 5 thì bảng trắng trơn, và
  // một effect sửa lại sẽ gây thêm một vòng render.
  const trangHienTai = Math.min(trang, tongTrang);
  const batDau = (trangHienTai - 1) * soDong;
  const hienThi = filtered.slice(batDau, batDau + soDong);

  const dem = (pred: (o: OrderListItem) => boolean) => orders.filter(pred).length;

  const stats = [
    {
      label: "Tổng đơn hàng",
      value: orders.length,
      note: "200 đơn gần nhất",
      tone: styles.toneAll,
      icon: ClipboardList,
      status: null,
    },
    {
      label: "Đơn nháp",
      value: dem((o) => o.status === "DRAFT"),
      note: "Đang giữ tồn, chờ khách",
      tone: styles.toneDraft,
      icon: FileText,
      status: "DRAFT",
    },
    {
      label: "Chờ xác nhận",
      value: dem((o) => o.status === "PENDING_CONFIRMATION"),
      note: "Khách đã mở link",
      tone: styles.toneWaiting,
      icon: Clock,
      status: "PENDING_CONFIRMATION",
    },
    {
      label: "Đã xác nhận",
      value: dem((o) => o.status === "CONFIRMED"),
      note: "Đủ địa chỉ giao hàng",
      tone: styles.toneConfirmed,
      icon: CheckCircle2,
      status: "CONFIRMED",
    },
    {
      label: "Đã thanh toán",
      value: dem((o) => o.paymentStatus === "PAID"),
      note: "Chuyển khoản và COD",
      tone: styles.tonePaid,
      icon: Wallet,
      status: null,
    },
    {
      label: "Đang đóng gói",
      value: dem((o) => o.status === "PROCESSING"),
      note: "Chờ bàn giao vận chuyển",
      tone: styles.tonePacking,
      icon: Package,
      status: "PROCESSING",
    },
    {
      label: "Hoàn thành",
      value: dem((o) => o.status === "COMPLETED"),
      note: "Hàng đã rời kho",
      tone: styles.toneDone,
      icon: PackageCheck,
      status: "COMPLETED",
    },
  ];

  const soDieuKien = demDieuKien(rows);

  // Đóng popup khi bấm ra ngoài hoặc bấm Esc — nếu không, bảng lọc che
  // mất danh sách và người dùng phải bấm đúng lại cái nút mới đóng được.
  const refLoc = useDongKhiBamNgoai(moLoc, () => setMoLoc(false));
  const refSort = useDongKhiBamNgoai(moSort, () => setMoSort(false));

  /** Bấm một thẻ số liệu là đặt luôn điều kiện trạng thái tương ứng. */
  function locTheoTrangThai(status: string) {
    const cu = rows.find((r) => r.field === "status");
    const dangChon = cu?.values.length === 1 && cu.values[0] === status;

    setTrang(1);
    if (dangChon) {
      setRows(rows.filter((r) => r.field !== "status"));
      return;
    }
    const moi = { ...newRow("status"), values: [status] };
    setRows(cu ? rows.map((r) => (r.field === "status" ? moi : r)) : [...rows, moi]);
  }

  function dangChonTrangThai(status: string) {
    const r = rows.find((x) => x.field === "status");
    return r?.op === "is" && r.values.length === 1 && r.values[0] === status;
  }

  /** Xuất đúng những đơn đang hiển thị, theo đúng thứ tự trên bảng. */
  function xuatExcel() {
    setLoiThaoTac(null);
    const csv = buildCsv(filtered, [
      { header: "Mã đơn", value: (o) => o.orderCode },
      {
        header: "Trạng thái",
        value: (o) => orderStatuses[o.status]?.label ?? o.status,
      },
      { header: "Nguồn", value: (o) => orderSources[o.source] ?? o.source },
      { header: "Người nhận", value: (o) => o.recipientName ?? "" },
      // Để dạng chữ: số điện thoại bắt đầu bằng 0, Excel đọc là số thì
      // mất luôn số 0 đầu và sai toàn bộ danh bạ.
      { header: "Điện thoại", value: (o) => o.recipientPhone ?? "" },
      { header: "Số dòng hàng", value: (o) => o.itemCount },
      { header: "Tổng tiền", value: (o) => o.totalAmount },
      {
        header: "Thanh toán",
        value: (o) =>
          o.paymentStatus === "PAID"
            ? "Đã thu"
            : o.paymentStatus
              ? "Chờ thu"
              : "Chưa tạo",
      },
      { header: "Chặn COD", value: (o) => (o.codBlocked ? "Có" : "") },
      { header: "Hạn giữ hàng", value: (o) => o.heldUntil ?? "" },
      { header: "Tạo lúc", value: (o) => o.createdAt },
    ]);
    downloadCsv(tenTep("don-hang"), csv);
  }

  /**
   * In phiếu giao cho những đơn đang hiển thị.
   *
   * Phải tải chi tiết từng đơn vì danh sách không có địa chỉ và dòng
   * hàng — hai thứ người đóng gói cần nhất.
   */
  async function inHangLoat() {
    setLoiThaoTac(null);
    const canIn = filtered.slice(0, GIOI_HAN_IN);
    if (canIn.length === 0) return;

    setDangIn(`0/${canIn.length}`);
    try {
      const chiTiet = await taiChiTiet(
        canIn.map((o) => o.orderCode),
        (xong, tong) => setDangIn(`${xong}/${tong}`),
      );
      if (chiTiet.length === 0) {
        throw new Error("Không tải được phiếu nào");
      }
      setPhieuIn(chiTiet);
      // Đợi React vẽ xong khu vực phiếu rồi mới gọi hộp thoại in,
      // nếu không trình duyệt chụp một trang còn trống.
      setTimeout(moHopThoaiIn, 60);
    } catch (err) {
      setLoiThaoTac(err instanceof Error ? err.message : String(err));
    } finally {
      setDangIn(null);
    }
  }

  function luuBoLoc() {
    const ten = window.prompt("Đặt tên cho bộ lọc này:");
    if (!ten?.trim()) return;
    ghiLai([
      ...daLuu.filter((b) => b.ten !== ten.trim()),
      { ten: ten.trim(), mode, rows },
    ]);
  }

  return (
    <>
      <div className={styles.head}>
        <div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Quản lý Đơn hàng Livestream</h1>
            {/* Phản ánh tình trạng gọi API thật, không phải nhãn trang trí:
                một chấm luôn xanh bất kể thực tế còn tệ hơn không có. */}
            <span
              className={`${styles.pill} ${error ? styles.pillDown : styles.pillOk}`}
            >
              <span className={styles.dot} aria-hidden="true" />
              {error ? "Mất kết nối dịch vụ" : "Dữ liệu trực tiếp"}
            </span>
          </div>
          <p className={styles.subtitle}>
            Đơn chốt từ bình luận trong phiên live, kèm thời gian còn lại của
            lượt giữ hàng và tình trạng thu tiền.
          </p>
        </div>

        <div className={styles.headActions}>
          <Button
            variant="secondary"
            onClick={xuatExcel}
            disabled={filtered.length === 0}
            title={
              filtered.length === 0
                ? "Không có đơn nào để xuất"
                : `Xuất ${filtered.length} đơn đang hiển thị`
            }
          >
            <Download size={17} aria-hidden="true" /> Xuất Excel (
            {filtered.length})
          </Button>
          <Button
            variant="secondary"
            onClick={inHangLoat}
            disabled={filtered.length === 0 || dangIn !== null}
            title={
              filtered.length > GIOI_HAN_IN
                ? `Chỉ in ${GIOI_HAN_IN} đơn đầu tiên`
                : undefined
            }
          >
            <Printer size={17} aria-hidden="true" />{" "}
            {dangIn
              ? `Đang chuẩn bị ${dangIn}…`
              : `In hàng loạt (${Math.min(filtered.length, GIOI_HAN_IN)})`}
          </Button>
          <Button onClick={reload} disabled={refreshing}>
            <RefreshCw size={17} aria-hidden="true" />{" "}
            {refreshing ? "Đang tải…" : "Làm mới dữ liệu"}
          </Button>
        </div>
      </div>

      {loiThaoTac && (
        <div className="notice notice-danger" role="alert">
          <h3>Không thực hiện được</h3>
          <p>{loiThaoTac}</p>
        </div>
      )}

      <div className={styles.stats}>
        {stats.map((s) => {
          const Icon = s.icon;
          const bamDuoc = s.status !== null;
          const dangChon = bamDuoc && dangChonTrangThai(s.status);
          const noiDung = (
            <>
              <div className={styles.statHead}>
                <p className={styles.statLabel}>{s.label}</p>
                <Icon size={16} aria-hidden="true" className={s.tone} />
              </div>
              <strong className={`${styles.statValue} ${s.tone}`}>
                {s.value.toLocaleString("vi-VN")}
                <span className={styles.statUnit}>đơn</span>
              </strong>
              <p className={styles.statNote}>{s.note}</p>
            </>
          );

          return bamDuoc ? (
            <button
              key={s.label}
              type="button"
              className={`${styles.stat} ${dangChon ? styles.statActive : ""}`}
              aria-pressed={dangChon}
              onClick={() => locTheoTrangThai(s.status)}
            >
              {noiDung}
            </button>
          ) : (
            <div key={s.label} className={styles.stat}>
              {noiDung}
            </div>
          );
        })}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Search size={16} aria-hidden="true" className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="search"
            aria-label="Tìm đơn hàng"
            placeholder="Tìm theo mã đơn, tên người nhận hoặc số điện thoại…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setTrang(1);
            }}
          />
        </div>

        <div className={styles.anchor} ref={refSort}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-expanded={moSort}
            aria-label="Sắp xếp danh sách"
            onClick={() => setMoSort((v) => !v)}
          >
            <ArrowUpDown size={16} aria-hidden="true" />
          </button>
          {moSort && (
            <div className={styles.sortMenu} role="menu">
              {SAP_XEP.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="menuitem"
                  className={`${styles.sortItem} ${
                    sort === s.key ? styles.sortItemOn : ""
                  }`}
                  onClick={() => {
                    setSort(s.key);
                    setMoSort(false);
                    setTrang(1);
                  }}
                >
                  <Check
                    size={14}
                    aria-hidden="true"
                    style={{ opacity: sort === s.key ? 1 : 0 }}
                  />
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.anchor} ref={refLoc}>
          <button
            type="button"
            className={`${styles.iconBtn} ${soDieuKien > 0 ? styles.iconBtnOn : ""}`}
            aria-expanded={moLoc}
            onClick={() => setMoLoc((v) => !v)}
          >
            <Filter size={16} aria-hidden="true" />
            Bộ lọc
            {soDieuKien > 0 && (
              <span className={styles.count}>{soDieuKien}</span>
            )}
          </button>

          {moLoc && (
            <div className={styles.pop}>
              <OrderFilterBuilder
                rows={rows}
                mode={mode}
                onRowsChange={(r) => {
                  setRows(r);
                  setTrang(1);
                }}
                onModeChange={(m) => {
                  setMode(m);
                  setTrang(1);
                }}
                onReset={() => {
                  setRows(rowsMacDinh());
                  setTrang(1);
                }}
                onSave={luuBoLoc}
                ketQua={filtered.length}
              />

              {daLuu.length > 0 && (
                <div className={styles.saved}>
                  <span className={styles.savedLabel}>Bộ lọc đã lưu:</span>
                  {daLuu.map((b) => (
                    <span key={b.ten} className={styles.savedChip}>
                      <button
                        type="button"
                        className={styles.savedApply}
                        onClick={() => {
                          setMode(b.mode);
                          setRows(b.rows);
                        }}
                      >
                        {b.ten}
                      </button>
                      <button
                        type="button"
                        className={styles.savedDrop}
                        aria-label={`Xoá bộ lọc ${b.ten}`}
                        onClick={() => ghiLai(daLuu.filter((x) => x.ten !== b.ten))}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={styles.panel}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState
            action={
              <Button variant="secondary" onClick={reload}>
                Thử lại
              </Button>
            }
          />
        ) : filtered.length ? (
          <div className="table-wrap">
            <table className={`data-table ${zebra.zebra}`}>
              <caption className="sr-only">
                Đơn hàng phát sinh từ phiên livestream
              </caption>
              <thead>
                <tr>
                  <th scope="col">Mã đơn</th>
                  <th scope="col">Người nhận</th>
                  <th scope="col" className="col-secondary">Số dòng hàng</th>
                  <th scope="col" className="num">Tổng tiền</th>
                  <th scope="col">Thanh toán</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col" className="num">Giữ hàng</th>
                  <th scope="col" className="num">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {hienThi.map((order) => (
                  <OrderRow key={order.id} order={order} now={now} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Chưa có đơn nào"
            description={
              demDieuKien(rows) > 0
                ? "Không đơn nào khớp bộ lọc. Thử bỏ bớt điều kiện."
                : "Chờ khách chốt đơn trong phiên."
            }
          />
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className={styles.pager}>
            <span className={styles.pagerInfo}>
              Hiện {batDau + 1}–{batDau + hienThi.length} trong{" "}
              <strong>{filtered.length}</strong> đơn
            </span>

            <label className={styles.perPage}>
              Mỗi trang
              <select
                className={styles.perPageSelect}
                aria-label="Số dòng mỗi trang"
                value={soDong}
                onChange={(e) => {
                  setSoDong(Number(e.target.value));
                  setTrang(1);
                }}
              >
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} dòng
                  </option>
                ))}
              </select>
            </label>

            <nav className={styles.pages} aria-label="Phân trang">
              <button
                type="button"
                className={styles.page}
                aria-label="Trang trước"
                disabled={trangHienTai === 1}
                onClick={() => setTrang(trangHienTai - 1)}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>

              {danhSachTrang(trangHienTai, tongTrang).map((t, i) =>
                t === "gap" ? (
                  <span key={`gap-${i}`} className={styles.gap} aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={t}
                    type="button"
                    className={`${styles.page} ${
                      t === trangHienTai ? styles.pageOn : ""
                    }`}
                    aria-label={`Trang ${t}`}
                    aria-current={t === trangHienTai ? "page" : undefined}
                    onClick={() => setTrang(t)}
                  >
                    {t}
                  </button>
                ),
              )}

              <button
                type="button"
                className={styles.page}
                aria-label="Trang sau"
                disabled={trangHienTai === tongTrang}
                onClick={() => setTrang(trangHienTai + 1)}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </nav>
          </div>
        )}
      </div>

      <PrintableOrders orders={phieuIn} />
    </>
  );
}

function OrderRow({ order, now }: { order: OrderListItem; now: number }) {
  const remaining = now ? secondsLeft(order.heldUntil, now) : null;
  const meta = orderStatuses[order.status] ?? {
    label: order.status,
    tone: "neutral",
  };
  const huyDuoc = !KHONG_HUY_DUOC.includes(order.status);

  return (
    <tr>
      <td>
        <strong>{order.orderCode}</strong>
        <p className="muted">{orderSources[order.source] ?? order.source}</p>
      </td>
      <td>
        {/* Đơn nháp chưa qua bước xác nhận nên chưa có thông tin người nhận. */}
        <strong>{order.recipientName ?? "Chưa có"}</strong>
        <p className="muted">{order.recipientPhone ?? "—"}</p>
      </td>
      <td className="col-secondary">{order.itemCount} mã</td>
      <td className="num">
        <strong>{formatMoney(Number(order.totalAmount))}</strong>
      </td>
      <td>
        {order.paymentStatus ? (
          <Badge tone={order.paymentStatus === "PAID" ? "success" : "warning"}>
            {order.paymentStatus === "PAID" ? "Đã thu" : "Chờ thu"}
          </Badge>
        ) : (
          <span className="muted">Chưa tạo</span>
        )}
        {order.codBlocked ? (
          <p className="muted" title="Khách có lịch sử bỏ đơn">
            Không cho COD
          </p>
        ) : null}
      </td>
      <td>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </td>
      <td className="num">
        {remaining === null ? (
          <span className="muted">—</span>
        ) : (
          <span className="countdown" data-urgent={remaining < 60}>
            {formatCountdown(remaining)}
          </span>
        )}
      </td>
      <td className="num">
        <div className="row-actions">
          <Link
            className="row-action"
            href={`/shop/orders/${order.orderCode}`}
            title={`Xem chi tiết đơn ${order.orderCode}`}
          >
            <Eye size={16} aria-hidden="true" />
            {/* Tên khả truy cập phải nêu rõ đơn nào — mọi dòng cùng
                đọc là "Xem chi tiết" thì không phân biệt được. */}
            <span className="sr-only">Xem chi tiết đơn {order.orderCode}</span>
          </Link>
          {/* Đơn đã giao, đã huỷ hoặc đã hết hạn thì không còn gì để
              huỷ. Bày nút ra là mời người dùng bấm vào một việc chắc
              chắn thất bại. */}
          {huyDuoc && (
            <Link
              className="row-action"
              href={`/shop/orders/${order.orderCode}#huy-don`}
              title={`Hủy đơn ${order.orderCode}`}
            >
              <XCircle size={16} aria-hidden="true" />
              <span className="sr-only">Hủy đơn {order.orderCode}</span>
            </Link>
          )}
        </div>
      </td>
    </tr>
  );
}
