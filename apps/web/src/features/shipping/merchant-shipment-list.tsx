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
  Download,
  PackageCheck,
  RefreshCw,
  Search,
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
import { buildCsv, downloadCsv, tenTep } from "@/lib/export-csv";
import { formatDateTime, formatMoney } from "@/lib/format";
import { shippingApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";
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

const MOI_TRANG = [10, 20, 50, 100];

export function MerchantShipmentList() {
  const { data, loading, error, refreshing, reload } = useApi(
    () => shippingApi.list({ limit: 200 }),
    [],
  );
  const { data: hangData } = useApi(() => shippingApi.carriers(), []);

  const vanDons = useMemo(() => data ?? [], [data]);
  const hangs = useMemo(() => hangData ?? [], [hangData]);

  const [tuKhoa, setTuKhoa] = useState("");
  const [locHang, setLocHang] = useState("");
  const [nhom, setNhom] = useState<NhomKey | "">("");
  const [trang, setTrang] = useState(1);
  const [moiTrang, setMoiTrang] = useState(20);

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
    return vanDons.filter((v) => {
      if (locHang && v.carrier !== locHang) return false;
      if (
        nhom &&
        !(NHOM[nhom].trangThai as readonly string[]).includes(v.status)
      ) {
        return false;
      }
      if (!tk) return true;
      // Tìm được bằng cả mã vận đơn, mã đơn và tên khách — ba thứ shop
      // có trong tay khi khách gọi điện hỏi.
      return [v.trackingCode, v.orderCode, v.recipientName, v.clientOrderCode]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(tk));
    });
  }, [vanDons, tuKhoa, locHang, nhom]);

  const tongTrang = Math.max(1, Math.ceil(daLoc.length / moiTrang));
  // Lọc xong có thể còn ít trang hơn trang đang đứng; kẹp lại thay vì
  // để người dùng nhìn một bảng trống không hiểu vì sao.
  const trangHienTai = Math.min(trang, tongTrang);
  const batDau = (trangHienTai - 1) * moiTrang;
  const trenTrang = daLoc.slice(batDau, batDau + moiTrang);

  function xuatCsv() {
    downloadCsv(
      tenTep("van-don"),
      buildCsv(daLoc, [
        { header: "Mã vận đơn", value: (v) => v.trackingCode ?? "" },
        { header: "Mã đơn", value: (v) => v.orderCode },
        { header: "Người nhận", value: (v) => v.recipientName ?? "" },
        { header: "Hãng", value: (v) => tenHang(v.carrier, v.serviceCode) },
        {
          header: "Trạng thái",
          value: (v) => shipmentStatuses[v.status]?.label ?? v.status,
        },
        { header: "Thu hộ", value: (v) => v.codAmount },
        { header: "Cước báo giá", value: (v) => v.feeQuoted ?? "" },
        { header: "Cước thực tế", value: (v) => v.feeActual ?? "" },
        { header: "Cân nặng (g)", value: (v) => v.weightGram },
        { header: "Tạo lúc", value: (v) => formatDateTime(v.createdAt) },
      ]),
    );
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
          <Button variant="secondary" onClick={xuatCsv} disabled={!daLoc.length}>
            <Download size={16} /> Xuất CSV
          </Button>
          <Button variant="secondary" onClick={reload}>
            <RefreshCw size={16} /> Làm mới
          </Button>
        </div>
      </header>

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
          return (
            <button
              key={k}
              type="button"
              className={`${styles.stat} ${n.tone} ${
                nhom === k ? styles.statActive : ""
              }`}
              onClick={() => {
                setNhom(nhom === k ? "" : k);
                setTrang(1);
              }}
              aria-pressed={nhom === k}
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

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Search size={16} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Tìm mã vận đơn, mã đơn hoặc tên khách"
            value={tuKhoa}
            onChange={(e) => {
              setTuKhoa(e.target.value);
              setTrang(1);
            }}
          />
        </div>

        <select
          className={styles.select}
          value={locHang}
          onChange={(e) => {
            setLocHang(e.target.value);
            setTrang(1);
          }}
          aria-label="Lọc theo hãng"
        >
          <option value="">Tất cả hãng</option>
          {Object.entries(carrierLabels).map(([ma, nhan]) => (
            <option key={ma} value={ma}>
              {nhan}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.panel}>
        {trenTrang.length === 0 ? (
          <EmptyState
            title="Chưa có vận đơn nào"
            description="Vào một đơn đã xác nhận rồi bấm Tạo vận đơn."
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

            <div className={styles.pager}>
              <span className={styles.pagerInfo}>
                Hiện {batDau + 1}–{Math.min(batDau + moiTrang, daLoc.length)} trên{" "}
                {daLoc.length} vận đơn
              </span>

              <label className={styles.perPage}>
                Mỗi trang
                <select
                  className={styles.select}
                  value={moiTrang}
                  onChange={(e) => {
                    setMoiTrang(Number(e.target.value));
                    setTrang(1);
                  }}
                >
                  {MOI_TRANG.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <nav className={styles.pages} aria-label="Phân trang">
                <button
                  type="button"
                  className={styles.page1}
                  onClick={() => setTrang(trangHienTai - 1)}
                  disabled={trangHienTai <= 1}
                >
                  Trước
                </button>
                <span className={styles.perPage}>
                  {trangHienTai} / {tongTrang}
                </span>
                <button
                  type="button"
                  className={styles.page1}
                  onClick={() => setTrang(trangHienTai + 1)}
                  disabled={trangHienTai >= tongTrang}
                >
                  Sau
                </button>
              </nav>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
