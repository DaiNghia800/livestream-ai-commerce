"use client";

/**
 * Màn quản lý vận chuyển.
 *
 * Ba việc shop làm mỗi ngày, nên ba việc đó phải bấm được từ một chỗ:
 * xem đơn nào chờ hãng tới lấy, đơn nào đang trễ, và đơn nào hãng đã
 * giao xong mà tiền chưa về.
 *
 * Bốn thẻ thống kê CŨNG LÀ bộ lọc — bấm vào thẻ là lọc theo nhóm đó.
 * Đặt số và bộ lọc tách rời nhau thì người dùng nhìn thấy "12 đơn
 * trễ" rồi phải tự đi tìm chúng ở đâu.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CircleDollarSign,
  Download,
  ListFilter,
  PackageCheck,
  RefreshCw,
  Truck,
  Warehouse,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/feedback/states";
import { downloadXlsx } from "@/lib/export-xlsx";
import { formatDateTime, formatMoney } from "@/lib/format";
import { shippingApi, type ShipmentListItem } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  CommerceListToolbar,
  CommercePager,
  defaultFilterRows,
  matchesFilters,
  type ListFilterField,
  type ListFilterRow,
  type MatchMode,
  type SortOption,
} from "@/features/shared/commerce-list-controls";
import zebra from "@/styles/zebra-table.module.css";
import { carrierLabels, shipmentStatuses, tenHang } from "./labels";
import styles from "./shipment-list.module.css";

/** Bốn nhóm việc, cũng là bốn thẻ thống kê ở đầu trang. */
const NHOM = {
  cholay: {
    nhan: "Chờ lấy hàng",
    icon: Warehouse,
    tone: styles.toneWaiting,
    ghiChu: "Hãng chưa tới lấy",
    trangThai: ["CREATED", "REQUESTED"],
  },
  dangdi: {
    nhan: "Đang vận chuyển",
    icon: Truck,
    tone: styles.toneMoving,
    ghiChu: "Trên đường tới khách",
    trangThai: ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"],
  },
  xong: {
    nhan: "Giao thành công",
    icon: PackageCheck,
    tone: styles.toneDone,
    ghiChu: "Khách đã nhận hàng",
    trangThai: ["DELIVERED"],
  },
  canchuy: {
    nhan: "Cần chú ý",
    icon: AlertTriangle,
    tone: styles.toneBad,
    ghiChu: "Giao hụt, hoàn về, bị từ chối",
    trangThai: ["FAILED", "RETURNING", "RETURNED", "REJECTED"],
  },
} as const;

type NhomKey = keyof typeof NHOM;

const SORT_OPTIONS = [
  { key: "newest", label: "Mới nhất trước" },
  { key: "oldest", label: "Cũ nhất trước" },
  { key: "codDesc", label: "Thu hộ cao → thấp" },
  { key: "codAsc", label: "Thu hộ thấp → cao" },
  { key: "feeDesc", label: "Cước cao → thấp" },
] as const satisfies SortOption<string>[];

type SortKey = (typeof SORT_OPTIONS)[number]["key"];

const SHIPMENT_FIELDS: ListFilterField<ShipmentListItem>[] = [
  {
    key: "status",
    label: "Trạng thái",
    icon: ListFilter,
    kind: "multi",
    options: Object.entries(shipmentStatuses).map(([value, meta]) => ({ value, label: meta.label })),
    pick: (shipment) => shipment.status,
  },
  {
    key: "carrier",
    label: "Đơn vị vận chuyển",
    icon: Truck,
    kind: "multi",
    options: Object.entries(carrierLabels).map(([value, label]) => ({ value, label })),
    pick: (shipment) => shipment.carrier,
  },
  {
    key: "cod",
    label: "Tiền thu hộ",
    icon: CircleDollarSign,
    kind: "range",
    pick: (shipment) => Number(shipment.codAmount),
  },
  {
    key: "fee",
    label: "Cước vận chuyển",
    icon: CircleDollarSign,
    kind: "range",
    pick: (shipment) => Number(shipment.feeActual ?? shipment.feeQuoted ?? 0),
  },
  {
    key: "weight",
    label: "Cân nặng (g)",
    icon: Warehouse,
    kind: "range",
    pick: (shipment) => shipment.weightGram,
  },
];

export function MerchantShipmentList() {
  const { data, loading, error, refreshing, reload } = useApi(
    () => shippingApi.list({ limit: 200 }),
    [],
  );
  const { data: hangData } = useApi(() => shippingApi.carriers(), []);

  const vanDons = useMemo(() => data ?? [], [data]);
  const hangs = useMemo(() => hangData ?? [], [hangData]);

  const [tuKhoa, setTuKhoa] = useState("");
  const [sapXep, setSapXep] = useState<SortKey>("newest");
  const [rows, setRows] = useState<ListFilterRow[]>(() => defaultFilterRows(["status", "carrier"]));
  const [mode, setMode] = useState<MatchMode>("ALL");
  const [trang, setTrang] = useState(1);
  const [moiTrang, setMoiTrang] = useState(20);
  const [exportError, setExportError] = useState<string | null>(null);

  const dem = useMemo(() => {
    const d: Record<NhomKey, number> = {
      cholay: 0,
      dangdi: 0,
      xong: 0,
      canchuy: 0,
    };
    for (const v of vanDons) {
      for (const k of Object.keys(NHOM) as NhomKey[]) {
        if ((NHOM[k].trangThai as readonly string[]).includes(v.status)) {
          d[k] += 1;
        }
      }
    }
    return d;
  }, [vanDons]);

  const daLoc = useMemo(() => {
    const tk = tuKhoa.trim().toLowerCase();
    const result = vanDons.filter((shipment) => {
      const searchMatches = !tk || [
        shipment.trackingCode,
        shipment.orderCode,
        shipment.recipientName,
        shipment.clientOrderCode,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(tk));
      return searchMatches && matchesFilters(shipment, rows, mode, SHIPMENT_FIELDS);
    });
    return [...result].sort((a, b) => {
      switch (sapXep) {
        case "oldest": return a.createdAt.localeCompare(b.createdAt);
        case "codDesc": return Number(b.codAmount) - Number(a.codAmount);
        case "codAsc": return Number(a.codAmount) - Number(b.codAmount);
        case "feeDesc": return Number(b.feeActual ?? b.feeQuoted ?? 0) - Number(a.feeActual ?? a.feeQuoted ?? 0);
        default: return b.createdAt.localeCompare(a.createdAt);
      }
    });
  }, [vanDons, tuKhoa, rows, mode, sapXep]);

  const tongTrang = Math.max(1, Math.ceil(daLoc.length / moiTrang));
  // Lọc xong có thể còn ít trang hơn trang đang đứng; kẹp lại thay vì
  // để người dùng nhìn một bảng trống không hiểu vì sao.
  const trangHienTai = Math.min(trang, tongTrang);
  const batDau = (trangHienTai - 1) * moiTrang;
  const trenTrang = daLoc.slice(batDau, batDau + moiTrang);

  async function xuatExcel() {
    setExportError(null);
    try {
      await downloadXlsx("van-don", "Vận đơn", daLoc, [
        { header: "Mã vận đơn", value: (v) => v.trackingCode ?? "" },
        { header: "Mã đơn", value: (v) => v.orderCode },
        { header: "Người nhận", value: (v) => v.recipientName ?? "" },
        { header: "Hãng", value: (v) => tenHang(v.carrier, v.serviceCode) },
        {
          header: "Trạng thái",
          value: (v) => shipmentStatuses[v.status]?.label ?? v.status,
        },
        { header: "Thu hộ (₫)", value: (v) => v.codAmount, kind: "money" },
        { header: "Cước báo giá (₫)", value: (v) => v.feeQuoted, kind: "money" },
        { header: "Cước thực tế (₫)", value: (v) => v.feeActual, kind: "money" },
        { header: "Cân nặng (g)", value: (v) => v.weightGram, kind: "number" },
        { header: "Tạo lúc", value: (v) => formatDateTime(v.createdAt), minWidth: 20 },
      ]);
    } catch {
      setExportError("Không tạo được tệp Excel. Vui lòng thử lại.");
    }
  }

  if (loading) return <LoadingState />;
  if (error) {
    return (
      <div className={styles.page}>
        <ErrorState action={<Button onClick={reload}>Thử lại</Button>} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Vận chuyển</h1>
            {refreshing && <Badge tone="neutral">Đang làm mới…</Badge>}
          </div>
          <p className={styles.subtitle}>
            Đẩy đơn sang hãng, theo dõi hành trình và đối soát tiền thu hộ.
            Trạng thái tự cập nhật khi hãng báo về.
          </p>
        </div>
        <div className={styles.headActions}>
          <Button variant="secondary" onClick={xuatExcel} disabled={!daLoc.length}>
            <Download size={16} /> Xuất Excel ({daLoc.length})
          </Button>
          <Button variant="secondary" onClick={reload}>
            <RefreshCw size={16} /> Làm mới
          </Button>
        </div>
      </header>
      {exportError && <p role="alert">{exportError}</p>}

      {/* Tình trạng từng hãng. Hiện ngay đầu trang vì "đẩy đơn không
          được" gần như luôn là do hãng chưa khai khoá. */}
      {hangs.length > 0 && (
        <div className={styles.carriers}>
          {hangs.map((h) => (
            <span
              key={h.name}
              className={`${styles.carrierChip} ${h.ready ? styles.carrierOn : ""}`}
              title={
                h.ready
                  ? "Đã khai khoá, đẩy đơn được"
                  : `Chưa khai: ${h.missing.join(", ")}`
              }
            >
              <span className={`${styles.dot} ${h.ready ? styles.dotOn : ""}`} />
              {h.label}
            </span>
          ))}
        </div>
      )}

      <div className={styles.stats}>
        {(Object.keys(NHOM) as NhomKey[]).map((k) => {
          const n = NHOM[k];
          const Icon = n.icon;
          const statusRow = rows.find((row) => row.field === "status");
          const activeGroup = statusRow?.op === "is"
            && statusRow.values.length === n.trangThai.length
            && n.trangThai.every((status) => statusRow.values.includes(status));
          return (
            <button
              key={k}
              type="button"
              className={`${styles.stat} ${n.tone} ${
                activeGroup ? styles.statActive : ""
              }`}
              onClick={() => {
                setRows((current) => {
                  const other = current.filter((row) => row.field !== "status");
                  return activeGroup ? other : [...other, {
                    id: `status-${k}`,
                    field: "status",
                    op: "is",
                    values: [...n.trangThai],
                    from: "",
                    to: "",
                  }];
                });
                setTrang(1);
              }}
              aria-pressed={activeGroup}
            >
              <span className={styles.statHead}>
                <Icon size={14} /> {n.nhan}
              </span>
              <span className={styles.statValue}>{dem[k]}</span>
              <span className={styles.statNote}>{n.ghiChu}</span>
            </button>
          );
        })}
      </div>

      <p className={styles.subtitle}>Tìm và lọc trong tối đa 200 vận đơn gần nhất đã tải.</p>
      <CommerceListToolbar
        query={tuKhoa}
        onQueryChange={(value) => { setTuKhoa(value); setTrang(1); }}
        searchLabel="Tìm vận đơn"
        placeholder="Tìm mã vận đơn, mã đơn hoặc tên khách…"
        sort={sapXep}
        sortOptions={SORT_OPTIONS}
        onSortChange={(value) => { setSapXep(value); setTrang(1); }}
        fields={SHIPMENT_FIELDS}
        rows={rows}
        mode={mode}
        onRowsChange={(value) => { setRows(value); setTrang(1); }}
        onModeChange={(value) => { setMode(value); setTrang(1); }}
        resultCount={daLoc.length}
        itemLabel="vận đơn"
      />

      <div className={styles.panel}>
        {trenTrang.length === 0 ? (
          <EmptyState
            title={vanDons.length ? "Không có vận đơn khớp" : "Chưa có vận đơn nào"}
            description={vanDons.length ? "Thử đổi từ khóa hoặc đặt lại bộ lọc." : "Vào một đơn đã xác nhận rồi bấm Tạo vận đơn."}
          />
        ) : (
          <>
            <div className={styles.scroll}>
              <table className={`${styles.table} ${zebra.zebra}`}>
                <thead>
                  <tr>
                    <th>Mã vận đơn</th>
                    <th>Người nhận</th>
                    <th>Hãng</th>
                    <th className={styles.num}>Thu hộ</th>
                    <th className={styles.num}>Cước</th>
                    <th>Trạng thái</th>
                    <th>Cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {trenTrang.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <Link className={styles.code} href={`/shop/shipping/${v.id}`}>
                          {v.trackingCode ?? "chưa có mã"}
                        </Link>
                        <span className={styles.sub}>{v.orderCode}</span>
                      </td>
                      <td>
                        {v.recipientName ?? "—"}
                        {v.deliveryAttempt > 0 && (
                          <span className={styles.sub}>
                            đã giao hụt {v.deliveryAttempt} lần
                          </span>
                        )}
                      </td>
                      <td>{tenHang(v.carrier, v.serviceCode)}</td>
                      <td className={styles.num}>
                        {Number(v.codAmount) > 0 ? (
                          formatMoney(Number(v.codAmount))
                        ) : (
                          <span className={styles.waiting}>đã trả trước</span>
                        )}
                      </td>
                      <td className={styles.num}>
                        {formatMoney(Number(v.feeActual ?? v.feeQuoted ?? 0))}
                        {/* Hãng cân lại rồi sửa cước — phần chênh shop
                            chịu, nên phải hiện ra */}
                        {v.feeActual &&
                          v.feeQuoted &&
                          v.feeActual !== v.feeQuoted && (
                            <span className={styles.diff}>
                              lệch{" "}
                              {formatMoney(
                                Number(v.feeActual) - Number(v.feeQuoted),
                              )}
                            </span>
                          )}
                      </td>
                      <td>
                        <Badge tone={shipmentStatuses[v.status]?.tone ?? "neutral"}>
                          {shipmentStatuses[v.status]?.label ?? v.status}
                        </Badge>
                      </td>
                      <td>
                        {v.lastSyncedAt ? (
                          formatDateTime(v.lastSyncedAt)
                        ) : (
                          <span className={styles.waiting}>chưa đồng bộ</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <CommercePager
              page={trangHienTai}
              pageSize={moiTrang}
              total={daLoc.length}
              itemLabel="vận đơn"
              onPageChange={setTrang}
              onPageSizeChange={(size) => { setMoiTrang(size); setTrang(1); }}
            />
          </>
        )}
      </div>
    </div>
  );
}
