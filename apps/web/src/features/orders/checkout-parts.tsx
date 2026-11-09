"use client";

/**
 * Mảnh dùng chung của bước xác nhận đơn — trang /confirm/[token] và
 * ngăn kéo giỏ hàng trong phiên live cùng dùng:
 *   - DiaChiNhanHang : một dòng địa chỉ + "Thay đổi", như các sàn lớn
 *   - ChonCachTra    : thẻ chọn COD / chuyển khoản
 *   - loiXacNhan     : câu báo lỗi khi xác nhận hỏng (hết hàng…)
 */

import { MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError, type CustomerOrder, type UserAddress } from "@/lib/api";
import { TEN_NHAN, docDiaChi } from "./address-book-dialog";
import styles from "./checkout-parts.module.css";

export type PhuongThuc = "COD" | "ONLINE";

export function ChonCachTra({
  value,
  chon,
  onChon,
  ten,
  mo,
}: {
  value: PhuongThuc;
  chon: PhuongThuc;
  onChon: (v: PhuongThuc) => void;
  ten: string;
  mo: string;
}) {
  return (
    <label className={`${styles.cachTra} ${chon === value ? styles.cachTraChon : ""}`}>
      <input
        type="radio"
        name="phuong-thuc-thanh-toan"
        value={value}
        checked={chon === value}
        onChange={() => onChon(value)}
      />
      <span>
        <strong>{ten}</strong>
        <span className="muted">{mo}</span>
      </span>
    </label>
  );
}

/**
 * Dòng "Địa chỉ nhận hàng" của khách đã đăng nhập — như các sàn lớn:
 * tên (SĐT) · địa chỉ · nhãn, và một chữ "Thay đổi". Không có ô để gõ
 * lại; muốn khác thì chọn hoặc thêm trong sổ.
 */
export function DiaChiNhanHang({
  dangTai,
  diaChi,
  onDoi,
  onThem,
}: {
  dangTai: boolean;
  diaChi: UserAddress | null;
  onDoi: () => void;
  onThem: () => void;
}) {
  if (dangTai) {
    return <p className="muted">Đang tải sổ địa chỉ…</p>;
  }
  if (!diaChi) {
    return (
      <div className={styles.diaChiTrong}>
        <p className="muted">Bạn chưa có địa chỉ nhận hàng.</p>
        <Button type="button" variant="secondary" onClick={onThem}>
          <Plus size={16} aria-hidden="true" /> Thêm địa chỉ
        </Button>
      </div>
    );
  }
  return (
    <div className={styles.diaChiNhan} data-testid="dia-chi-nhan-hang">
      <span className={styles.diaChiNhanDau}>
        <MapPin size={16} aria-hidden="true" /> Địa chỉ nhận hàng
      </span>
      <div className={styles.diaChiNhanThan}>
        <span className={styles.diaChiNhanNguoi}>
          <strong>{diaChi.recipientName}</strong> ({diaChi.recipientPhone})
        </span>
        <span className={styles.diaChiNhanDong}>{docDiaChi(diaChi)}</span>
        {(diaChi.isDefault || diaChi.label) && (
          <span className={styles.diaChiNhanNhan}>
            {diaChi.isDefault && <span className={styles.nhanMacDinh}>Mặc định</span>}
            {diaChi.label && <span className={styles.nhanLoai}>{TEN_NHAN[diaChi.label]}</span>}
          </span>
        )}
        <button type="button" className={styles.doiDiaChi} onClick={onDoi}>
          Thay đổi
        </button>
      </div>
    </div>
  );
}

/**
 * Câu báo lỗi khi xác nhận thất bại.
 *
 * Riêng 409 OutOfStock nói thẳng mã nào thiếu và còn bao nhiêu: đơn
 * nháp không giữ tồn, người khác vừa bấm trước. Khách cần biết để
 * liên hệ shop sửa đơn — bấm lại không giải quyết được gì.
 */
export function loiXacNhan(cause: unknown, items: CustomerOrder["items"]): string {
  if (cause instanceof ApiError && cause.status === 409) {
    const body = cause.body as
      | { error?: string; rejected?: Array<{ skuId: string; requested: number; sellable: number }> }
      | undefined;
    if (body?.error === "OutOfStock" && body.rejected?.length) {
      const dong = body.rejected.map((r) => {
        const item = items.find((i) => i.skuId === r.skuId);
        const ten = item?.productName || item?.skuCode || `Mã ${r.skuId}`;
        return r.sellable > 0
          ? `${ten} chỉ còn ${r.sellable} (bạn chọn ${r.requested})`
          : `${ten} đã hết hàng`;
      });
      return `Rất tiếc, ${dong.join("; ")} — người khác vừa xác nhận trước. Liên hệ shop để sửa đơn.`;
    }
  }
  return cause instanceof Error ? cause.message : "Không xác nhận được đơn.";
}
