"use client";

/**
 * Khối "Địa chỉ nhận hàng" tự quản cho khách ĐÃ đăng nhập — dùng trong
 * mọi form đặt hàng (modal mua nhanh và thanh toán giỏ trên trang live).
 *
 * Giống trang /confirm/[token]: không có ô gõ tay; hiện một dòng địa chỉ
 * đang chọn (mặc định của sổ, hay cái đầu tiên) + "Thay đổi" mở popup
 * chọn/thêm trong sổ. Địa chỉ đang chọn được báo ra ngoài qua onChange
 * để form cha điền tên / SĐT / địa chỉ như khách vừa gõ.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { addressBookApi, type UserAddress } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { AddressFormDialog, ChonDiaChiDialog } from "./address-book-dialog";
import { DiaChiNhanHang } from "./checkout-parts";

export function ChonDiaChiNhanHang({
  onChange,
}: {
  /** Địa chỉ đang chọn; null khi sổ trống hoặc chưa tải xong. */
  onChange: (diaChi: UserAddress | null) => void;
}) {
  const soDiaChi = useApi(() => addressBookApi.list(), []);
  const [chonId, setChonId] = useState<string | null>(null);
  const [hopThoai, setHopThoai] = useState<"chon" | "them" | null>(null);

  const ds = soDiaChi.data ?? null;
  const diaChi = ds
    ? ds.find((d) => d.id === chonId) ?? ds.find((d) => d.isDefault) ?? ds[0] ?? null
    : null;

  // Giữ onChange trong ref: form cha thường truyền arrow mới mỗi lần render,
  // không để điều đó kích hoạt lại effect.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current(diaChi);
  }, [diaChi]);

  if (soDiaChi.error) {
    return (
      <div className="notice notice-warning" role="status">
        <p>Không tải được sổ địa chỉ của bạn.</p>
        <Button type="button" variant="secondary" onClick={() => soDiaChi.reload()}>
          Thử lại
        </Button>
      </div>
    );
  }

  return (
    <>
      <DiaChiNhanHang
        dangTai={!ds}
        diaChi={diaChi}
        onDoi={() => setHopThoai("chon")}
        onThem={() => setHopThoai("them")}
      />
      {hopThoai === "chon" && ds && (
        <ChonDiaChiDialog
          items={ds}
          chonId={diaChi?.id ?? null}
          onChon={setChonId}
          onClose={() => setHopThoai(null)}
          onDoi={() => soDiaChi.reload()}
        />
      )}
      {hopThoai === "them" && (
        <AddressFormDialog
          banDau={null}
          laDauTien={(ds?.length ?? 0) === 0}
          onClose={() => setHopThoai(null)}
          onSaved={(d) => {
            setChonId(d.id);
            setHopThoai(null);
            soDiaChi.reload();
          }}
        />
      )}
    </>
  );
}
