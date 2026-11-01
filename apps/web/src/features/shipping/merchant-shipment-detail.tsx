"use client";

/**
 * Chi tiết vận đơn.
 *
 * Hai thứ đáng giá nhất trên màn này:
 *
 *   - DÒNG THỜI GIAN. Khách gọi hỏi "hàng tới đâu rồi" thì đây là
 *     chỗ trả lời, nên mốc mới nhất phải nổi hẳn lên.
 *   - NHẬT KÝ SỰ KIỆN. Khi số liệu của ta và của hãng lệch nhau, đây
 *     là bằng chứng hãng đã báo gì và báo lúc nào.
 *
 * Mốc có mã lạ (hãng thêm trạng thái mới mà bảng tra của ta chưa có)
 * vẫn hiện ra kèm cảnh báo. Giấu đi thì không ai biết mà bổ sung.
 */

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Boxes,
  Check,
  FlaskConical,
  Package,
  Plus,
  RefreshCw,
  Link2,
  Truck,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ErrorState,
  LoadingState,
} from "@/components/feedback/states";
import { formatDateTime, formatMoney } from "@/lib/format";
import { shippingApi, type ShipmentStatus } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  CHANG_THUAN,
  changHienTai,
  HUY_DUOC,
  LECH_DUONG,
  MOC_BAM_TAY,
  shipmentStatuses,
  tenHang,
} from "./labels";
import styles from "./shipment-detail.module.css";

export function MerchantShipmentDetail({ shipmentId }: { shipmentId: string }) {
  const { data, loading, error, reload } = useApi(
    () => shippingApi.detail(shipmentId),
    [shipmentId],
  );
  const [dangChay, setDangChay] = useState(false);
  const [loiThaoTac, setLoiThaoTac] = useState<string | null>(null);
  const [daChepLink, setDaChepLink] = useState(false);

  if (loading) return <LoadingState />;
  if (error || !data) {
    return (
      <div className={styles.page}>
        <ErrorState action={<Button onClick={reload}>Thử lại</Button>} />
      </div>
    );
  }

  const vd = data;
  const huyDuoc = HUY_DUOC.includes(vd.status);
  const tuGiao = vd.carrier === "self";
  const mocCoTheBam = vd.status === "CREATED"
    ? MOC_BAM_TAY.filter((m) => m === "PICKED_UP")
    : vd.status === "PICKED_UP" || vd.status === "OUT_FOR_DELIVERY"
      ? MOC_BAM_TAY.filter((m) => m === "OUT_FOR_DELIVERY" || m === "DELIVERED" || m === "FAILED" || m === "RETURNED")
      : vd.status === "FAILED"
        ? MOC_BAM_TAY.filter((m) => m === "OUT_FOR_DELIVERY" || m === "RETURNED")
        : [];
  const nhan = shipmentStatuses[vd.status] ?? {
    label: vd.status,
    tone: "neutral" as const,
  };

  async function chay(viec: () => Promise<unknown>) {
    setDangChay(true);
    setLoiThaoTac(null);
    try {
      await viec();
      reload();
    } catch (err) {
      // Giữ NGUYÊN VĂN lý do hãng trả về: đó là thứ shop cần để gọi
      // điện hỏi họ, dịch lại hay rút gọn là mất thông tin.
      setLoiThaoTac(err instanceof Error ? err.message : "Thao tác thất bại");
    } finally {
      setDangChay(false);
    }
  }

  return (
    <div className={styles.page}>
      <Link className={styles.back} href="/shop/shipping">
        <ArrowLeft size={16} /> Danh sách vận đơn
      </Link>

      <header className={styles.head}>
        <div>
          <div className={styles.titleRow}>
            <h1 className={styles.code}>{vd.trackingCode ?? "Chưa có mã"}</h1>
            <Badge tone={nhan.tone}>{nhan.label}</Badge>
          </div>
          <p className={styles.sub}>
            Đơn{" "}
            <Link href={`/shop/orders/${vd.orderCode}`}>{vd.orderCode}</Link> ·{" "}
            {tenHang(vd.carrier, vd.serviceCode)} · tạo lúc{" "}
            {formatDateTime(vd.createdAt)}
          </p>
        </div>

        <div className={styles.actions}>
          {vd.trackingToken && (
            <Button
              variant="secondary"
              onClick={() => {
                const link = `${window.location.origin}/tracking/${vd.trackingToken}`;
                void navigator.clipboard?.writeText(link);
                setDaChepLink(true);
              }}
            >
              <Link2 size={16} />{" "}
              {daChepLink ? "Đã chép link" : "Link cho khách"}
            </Button>
          )}
          <Button variant="secondary" onClick={reload} disabled={dangChay}>
            <RefreshCw size={16} /> Làm mới
          </Button>
          {huyDuoc && (
            <Button
              variant="danger"
              disabled={dangChay}
              onClick={() => chay(() => shippingApi.cancel(vd.id))}
            >
              <Ban size={16} /> Huỷ vận đơn
            </Button>
          )}
        </div>
      </header>

      {loiThaoTac && (
        <div className={`${styles.notice} ${styles.noticeBad}`}>
          <AlertTriangle size={16} />
          <span>{loiThaoTac}</span>
        </div>
      )}

      {vd.failureReason && (
        <div className={`${styles.notice} ${styles.noticeBad}`}>
          <AlertTriangle size={16} />
          <span>
            <strong>{vd.status === "REQUESTED" ? "Chờ xác minh:" : "Hãng báo:"}</strong> {vd.failureReason}
          </span>
        </div>
      )}

      {!huyDuoc && vd.status !== "DELIVERED" && vd.status !== "RETURNED" && vd.status !== "REQUESTED" && (
        <div className={`${styles.notice} ${styles.noticeInfo}`}>
          <Package size={16} />
          <span>
            Hàng đã bàn giao cho hãng nên không huỷ được nữa. Muốn dừng giao
            thì liên hệ thẳng tổng đài của hãng.
          </span>
        </div>
      )}

      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>
            <Truck size={14} /> Đơn vị vận chuyển
          </span>
          <span className={styles.cardValue}>
            {tenHang(vd.carrier, vd.serviceCode)}
          </span>
          <span className={styles.cardNote}>
            mã gửi hãng: {vd.clientOrderCode}
          </span>
        </div>

        <div className={styles.card}>
          <span className={styles.cardLabel}>
            <Wallet size={14} /> Tiền thu hộ
          </span>
          <span className={styles.cardValue}>
            {Number(vd.codAmount) > 0
              ? formatMoney(Number(vd.codAmount))
              : "0 đ"}
          </span>
          <span className={styles.cardNote}>
            {Number(vd.codAmount) > 0
              ? "bưu tá thu khi giao"
              : "khách đã thanh toán trước"}
          </span>
        </div>

        <div className={styles.card}>
          <span className={styles.cardLabel}>Cước vận chuyển</span>
          <span className={styles.cardValue}>
            {formatMoney(Number(vd.feeActual ?? vd.feeQuoted ?? 0))}
          </span>
          {/* Hãng cân lại ở kho rồi chốt cước. Phần chênh shop chịu,
              nên nói rõ chứ không im lặng đổi số. */}
          <span className={styles.cardNote}>
            {vd.feeActual && vd.feeQuoted && vd.feeActual !== vd.feeQuoted
              ? `báo giá ${formatMoney(Number(vd.feeQuoted))}, hãng chốt lại sau khi cân`
              : "theo báo giá lúc tạo"}
          </span>
        </div>

        <div className={styles.card}>
          <span className={styles.cardLabel}>Đồng bộ gần nhất</span>
          <span className={styles.cardValue}>
            {vd.lastSyncedAt ? formatDateTime(vd.lastSyncedAt) : "chưa có"}
          </span>
          <span className={styles.cardNote}>
            {vd.deliveryAttempt > 0
              ? `đã giao hụt ${vd.deliveryAttempt} lần`
              : `cân nặng ${vd.weightGram} g`}
          </span>
        </div>
      </div>

      <ThanhTienTrinh status={vd.status} />

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <Package size={16} /> Thông tin bưu kiện
        </div>
        <div className={styles.panelBody}>
          <div className={styles.doiBen}>
            <BenGiaoNhanBox nhan="Nơi gửi" ben={vd.nguoiGui} gui />
            <BenGiaoNhanBox nhan="Nơi nhận" ben={vd.nguoiNhan} />
          </div>

          <dl className={styles.thongSo}>
            <ThongSo nhan="Hàng hoá">
              {vd.items.length === 0
                ? "—"
                : vd.items
                    .map((i) => `${i.skuCode} × ${i.quantity}`)
                    .join(", ")}
            </ThongSo>
            <ThongSo nhan="Kích thước đóng gói">
              {vd.lengthCm && vd.widthCm && vd.heightCm
                ? `${vd.lengthCm}×${vd.widthCm}×${vd.heightCm} cm`
                : "chưa khai"}
            </ThongSo>
            <ThongSo nhan="Khối lượng">{vd.weightGram} g</ThongSo>
            <ThongSo nhan="Giá trị khai giá">
              {Number(vd.insuranceValue ?? 0) > 0
                ? formatMoney(Number(vd.insuranceValue))
                : "không khai"}
            </ThongSo>
            <ThongSo nhan="Bên trả cước">
              {/* Hệ thống luôn gửi "người gửi trả" cho hãng. Hiện ra
                  để shop không phải mở portal hãng mới biết. */}
              Shop trả
            </ThongSo>
            <ThongSo nhan="Dự kiến giao">
              {vd.expectedDeliveryText ?? "hãng chưa tính"}
            </ThongSo>
            {vd.pickedUpAt && (
              <ThongSo nhan="Hãng lấy hàng lúc">
                {formatDateTime(vd.pickedUpAt)}
              </ThongSo>
            )}
            {vd.deliveredAt && (
              <ThongSo nhan="Giao xong lúc">
                {formatDateTime(vd.deliveredAt)}
              </ThongSo>
            )}
          </dl>

          {vd.note && (
            <p className={styles.ghiChu}>
              <strong>Dặn bưu tá:</strong> {vd.note}
            </p>
          )}
        </div>
      </section>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <Truck size={16} /> Hành trình bưu kiện
          </div>
          <div className={styles.panelBody}>
            {vd.events.length === 0 ? (
              <p className={styles.mocMoTa}>Chưa có mốc nào.</p>
            ) : (
              <ol className={styles.timeline}>
                {vd.events.map((e, i) => (
                  <li
                    key={`${e.eventCode}-${e.occurredAt}`}
                    className={`${styles.moc} ${i === 0 ? styles.mocMoi : ""}`}
                  >
                    <span className={styles.cham} />
                    <div className={styles.mocThan}>
                      <div className={styles.mocDau}>
                        <span className={styles.mocTen}>
                          {e.mappedStatus
                            ? (shipmentStatuses[e.mappedStatus]?.label ??
                              e.mappedStatus)
                            : e.eventCode}
                        </span>
                        <span className={styles.mocGio}>
                          {formatDateTime(e.occurredAt)}
                        </span>
                        {i === 0 && <Badge tone="neutral">mới nhất</Badge>}
                      </div>
                      {e.description && (
                        <p className={styles.mocMoTa}>{e.description}</p>
                      )}
                      {!e.mappedStatus && (
                        <span className={styles.mocLa}>
                          mã hãng chưa có trong bảng tra: {e.eventCode}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {tuGiao && mocCoTheBam.length > 0 && (
              <>
                <p className={styles.mocMoTa} style={{ marginTop: 16 }}>
                  Đơn tự giao không có hãng nào báo về, trạng thái do shop bấm.
                </p>
                <div className={styles.manual}>
                  {mocCoTheBam.map((m) => (
                    <Button
                      key={m}
                      variant="secondary"
                      disabled={dangChay}
                      onClick={() =>
                        chay(() =>
                          shippingApi.pushStatus(vd.id, m as ShipmentStatus),
                        )
                      }
                    >
                      {shipmentStatuses[m]?.label ?? m}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {vd.moPhong.length > 0 && (
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <FlaskConical size={16} /> Giả lập hãng (môi trường thử)
            </div>
            <div className={styles.panelBody}>
              <p className={styles.mocMoTa}>
                Sandbox của hãng không có bưu tá nên vận đơn nằm mãi ở
                &ldquo;chờ lấy hàng&rdquo;. Các nút dưới đây bắn gói tin
                đúng như hãng gửi, đi qua đủ lớp xác thực và chống trùng —
                bấm hai lần cùng một mốc sẽ bị chặn, đúng như thật.
              </p>
              <div className={styles.manual}>
                {vd.moPhong.map((m) => (
                  <Button
                    key={m.code}
                    variant="secondary"
                    disabled={dangChay}
                    onClick={() =>
                      chay(() => shippingApi.simulate(vd.id, m.code))
                    }
                  >
                    {m.label}
                    <span className={styles.maHang}>{m.code}</span>
                  </Button>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className={styles.panel}>
          <div className={styles.panelHead}>Nhật ký sự kiện từ hãng</div>
          <div className={styles.panelBody}>
            {vd.events.length === 0 ? (
              <p className={styles.mocMoTa}>Chưa nhận được gói tin nào.</p>
            ) : (
              <table className={styles.log}>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Mã sự kiện</th>
                    <th>Ánh xạ</th>
                  </tr>
                </thead>
                <tbody>
                  {vd.events.map((e) => (
                    <tr key={`log-${e.eventCode}-${e.occurredAt}`}>
                      <td>{formatDateTime(e.occurredAt)}</td>
                      <td>{e.eventCode}</td>
                      <td>{e.mappedStatus ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Một đầu của hành trình. Thiếu dữ liệu thì nói thẳng là thiếu. */
function BenGiaoNhanBox({
  nhan,
  ben,
  gui = false,
}: {
  nhan: string;
  ben: { name: string | null; phone: string | null; streetLine: string | null;
         wardName: string | null; districtName: string | null;
         provinceName: string | null } | null;
  gui?: boolean;
}) {
  const dong = ben
    ? [ben.streetLine, ben.wardName, ben.districtName, ben.provinceName]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <div className={styles.ben}>
      <span className={styles.benNhan}>
        {gui ? <Package size={13} /> : <Truck size={13} />} {nhan}
      </span>
      {ben?.name ? (
        <>
          <span className={styles.benTen}>
            {ben.name}
            {ben.phone && <span className={styles.benSdt}>{ben.phone}</span>}
          </span>
          <span className={styles.benDiaChi}>{dong || "chưa có địa chỉ"}</span>
        </>
      ) : (
        <span className={styles.benDiaChi}>chưa có</span>
      )}
    </div>
  );
}

function ThongSo({
  nhan,
  children,
}: {
  nhan: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.thongSoDong}>
      <dt>{nhan}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Thanh tiến trình ngang.
 *
 * Dòng thời gian bên dưới kể đủ mọi chuyện nhưng phải đọc mới hiểu.
 * Thanh này trả lời trong một cái liếc: hàng đang ở đoạn nào.
 *
 * Vận đơn đi lệch đường thuận (giao hỏng, hoàn về, bị huỷ) thì KHÔNG
 * vẽ thanh. Ép một đơn đã hoàn về vào thanh "đang giao → giao xong"
 * là nói dối ngay chỗ dễ nhìn nhất.
 */
function ThanhTienTrinh({ status }: { status: string }) {
  if (LECH_DUONG.has(status)) return null;

  const dangO = changHienTai(status);
  if (dangO < 0) return null;

  const icons = {
    CREATED: Plus,
    PICKED_UP: Package,
    IN_TRANSIT: Boxes,
    OUT_FOR_DELIVERY: Truck,
    DELIVERED: Check,
  };
  const daGiaoXong = status === "DELIVERED";

  return (
    <ol className={styles.tienTrinh} aria-label="Tiến trình giao hàng">
      {CHANG_THUAN.map((c, i) => {
        const xong = daGiaoXong || i < dangO;
        const hienTai = !daGiaoXong && i === dangO;
        const Icon = icons[c.status];
        return (
          <li
            key={c.status}
            className={[
              styles.chang,
              xong ? styles.changXong : "",
              hienTai ? styles.changHienTai : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={hienTai ? "step" : undefined}
            aria-label={`${c.label}: ${xong ? "hoàn tất" : hienTai ? "đang thực hiện" : "chưa tới"}`}
          >
            <span className={styles.changCham}><Icon size={22} aria-hidden="true" /></span>
            <span className={styles.changTen}>{c.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
