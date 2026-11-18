"use client";

/**
 * Khối "Phương thức vận chuyển" dùng chung cho ba chỗ khách chốt đơn:
 * trang /confirm/[token], màn "Thanh toán" trên trang live và ngăn kéo
 * giỏ hàng. Mỗi chỗ chỉ khác nhau ở CÁCH lấy bảng giá (có token hay
 * chưa), còn trạng thái hiển thị, dòng được chọn sẵn và phí đưa vào
 * tổng thì giống hệt — nên gom về một hook + một component.
 */

import { useState } from "react";
import type { ShippingOption } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { ChonVanChuyen, khoaVanChuyen } from "./checkout-parts";

export interface BangGiaVanChuyen {
  weightGram: number;
  items: ShippingOption[];
}

/**
 * `lay` là null khi chưa đủ địa chỉ (chưa có gì để hỏi). `deps` là các
 * giá trị mà đổi thì phải hỏi lại bảng giá (địa chỉ, cách trả, số món).
 *
 * Dòng được chọn suy ra lúc render: khách chưa chọn, hay bảng giá vừa
 * đổi làm dòng cũ biến mất, thì lấy dòng rẻ nhất (server đã xếp theo phí).
 */
export function useChonVanChuyen(
  lay: (() => Promise<BangGiaVanChuyen>) | null,
  deps: readonly unknown[],
) {
  const coDiaChi = lay !== null;
  const baoGia = useApi<BangGiaVanChuyen | null>(
    () => (lay ? lay() : Promise.resolve(null)),
    [coDiaChi, ...deps],
  );
  const [chonShip, setChonShip] = useState<string | null>(null);
  const phuongAnShip = coDiaChi ? baoGia.data?.items ?? [] : [];
  const phuongAnChon =
    phuongAnShip.find((o) => khoaVanChuyen(o) === chonShip) ?? phuongAnShip[0] ?? null;
  const dangLayPhi = coDiaChi && (baoGia.loading || baoGia.refreshing);
  return {
    coDiaChi,
    phuongAnShip,
    phuongAnChon,
    /** Phí của dòng đang chọn, 0 khi chưa có bảng giá. */
    phiShip: Number(phuongAnChon?.fee ?? 0),
    /** Gửi kèm lúc xác nhận: đúng giá khách đã thấy để server đối chiếu. */
    luaChon: phuongAnChon
      ? { carrier: phuongAnChon.carrier, serviceCode: phuongAnChon.serviceCode, fee: phuongAnChon.fee }
      : undefined,
    dangLayPhi,
    loi: coDiaChi ? baoGia.error : null,
    chon: setChonShip,
    reload: baoGia.reload,
  };
}

export type TrangThaiChonVanChuyen = ReturnType<typeof useChonVanChuyen>;

/** Nội dung khối vận chuyển theo trạng thái; tiêu đề do chỗ gọi tự đặt. */
export function KhoiChonVanChuyen({ ship }: { ship: TrangThaiChonVanChuyen }) {
  if (!ship.coDiaChi) {
    return <p className="muted">Chọn địa chỉ nhận hàng để xem phí vận chuyển.</p>;
  }
  if (ship.dangLayPhi && ship.phuongAnShip.length === 0) {
    return <p className="muted" role="status">Đang lấy bảng giá từ các hãng…</p>;
  }
  if (ship.loi) {
    return (
      <div className="notice notice-warning" role="status">
        Chưa lấy được bảng giá vận chuyển. Bạn vẫn có thể xác nhận, shop sẽ báo phí sau.
      </div>
    );
  }
  if (ship.phuongAnShip.length === 0) {
    return <p className="muted">Shop chưa mở dịch vụ vận chuyển nào. Shop sẽ báo phí sau khi chốt.</p>;
  }
  return (
    <ChonVanChuyen
      items={ship.phuongAnShip}
      chon={ship.phuongAnChon ? khoaVanChuyen(ship.phuongAnChon) : null}
      onChon={ship.chon}
    />
  );
}

/** Chữ hiện ở dòng "Phí vận chuyển" của bảng chi tiết trước khi xác nhận. */
export function chuPhiShip(ship: TrangThaiChonVanChuyen, formatMoney: (n: number) => string): string {
  if (ship.phuongAnChon) return ship.phiShip > 0 ? formatMoney(ship.phiShip) : "Miễn phí";
  if (!ship.coDiaChi) return "chọn địa chỉ để tính";
  return ship.dangLayPhi ? "đang tính…" : "shop báo sau";
}
