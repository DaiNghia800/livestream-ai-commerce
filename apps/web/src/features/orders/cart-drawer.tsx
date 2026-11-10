"use client";

/**
 * Giỏ hàng trong phiên live — ngăn kéo trượt từ mép phải, không rời
 * trang (video và chat vẫn chạy phía sau).
 *
 * Giỏ = đơn nháp đang mở của khách trong phiên. AI chốt từ bình luận
 * thì món rơi vào đây; khách sửa số lượng / bỏ món thoải mái vì nháp
 * không giữ tồn. Ba bước trong cùng ngăn kéo:
 *   1. Giỏ        — món, số lượng, tạm tính, nút "Xác nhận mua hàng"
 *   2. Xác nhận   — địa chỉ (sổ), ghi chú, COD / chuyển khoản
 *   3. Xong       — COD: đã chốt; online: khối chọn cổng / QR ngay tại chỗ
 *
 * Tồn chỉ được giữ ở bước 2 khi bấm "Xác nhận đơn hàng" — hết hàng thì
 * báo đúng món, giỏ vẫn còn để khách sửa.
 */

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addressBookApi,
  cartApi,
  ordersApi,
  type CartOrder,
  type UserAddress,
} from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { AddressFormDialog, ChonDiaChiDialog } from "./address-book-dialog";
import { ChonCachTra, DiaChiNhanHang, loiXacNhan, type PhuongThuc } from "./checkout-parts";
import { CustomerBankTransfer } from "./customer-bank-transfer";
import { CustomerOnlinePayment } from "./customer-online-payment";
import styles from "./cart-drawer.module.css";

/** Giỏ của tài khoản trong phiên; null khi chưa chốt gì hoặc chưa đăng nhập. */
export function useGioHang(livestreamId: string | null, daDangNhap: boolean) {
  const { data, loading, error, reload } = useApi(
    () => (livestreamId && daDangNhap ? cartApi.get(livestreamId) : Promise.resolve(null)),
    [livestreamId, daDangNhap],
  );
  const gio: CartOrder | null = data ?? null;
  const soMon = (gio?.items ?? []).reduce((t, i) => t + i.quantity, 0);
  return { gio, dangTai: loading, loi: error, taiLai: reload, soMon };
}

/** Món vừa được thêm, so giỏ trước và sau — để toast nói đúng tên. */
export function monVuaThem(truoc: CartOrder | null, sau: CartOrder | null): string[] {
  if (!sau) return [];
  const cu = new Map((truoc?.items ?? []).map((i) => [i.skuId, i.quantity]));
  return sau.items
    .filter((i) => i.quantity > (cu.get(i.skuId) ?? 0))
    .map((i) => `${i.quantity - (cu.get(i.skuId) ?? 0)} × ${i.productName || i.skuCode || "sản phẩm"}`);
}

type Buoc = "gio" | "xacNhan" | "xong";

export function CartDrawer({
  open,
  onClose,
  gio,
  dangTai,
  taiLai,
}: {
  open: boolean;
  onClose: () => void;
  gio: CartOrder | null;
  dangTai: boolean;
  taiLai: () => void;
}) {
  const [buoc, setBuoc] = useState<Buoc>("gio");
  const [ketQua, setKetQua] = useState<{ token: string; amount: string; phuongThuc: PhuongThuc } | null>(null);

  // Mọi đường đóng đều đi qua đây để lần mở sau bắt đầu lại từ giỏ.
  function dong() {
    setBuoc("gio");
    setKetQua(null);
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const phim = (e: KeyboardEvent) => {
      if (e.key === "Escape") dong();
    };
    document.addEventListener("keydown", phim);
    return () => document.removeEventListener("keydown", phim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.lop}>
      <button type="button" className={styles.phu} aria-label="Đóng giỏ hàng" onClick={dong} />
      <aside className={styles.ngan} role="dialog" aria-modal="true" aria-label="Giỏ hàng" data-testid="gio-hang">
        <header className={styles.dau}>
          {buoc === "xacNhan" ? (
            <button type="button" className={styles.nutLui} onClick={() => setBuoc("gio")} aria-label="Quay lại giỏ">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
          ) : (
            <ShoppingCart size={18} aria-hidden="true" className={styles.iconDau} />
          )}
          <h2>{buoc === "gio" ? "Giỏ hàng" : buoc === "xacNhan" ? "Xác nhận mua hàng" : "Đã chốt đơn"}</h2>
          <button type="button" className={styles.nutDong} onClick={dong} aria-label="Đóng giỏ hàng" autoFocus>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {buoc === "gio" && (
          <BuocGio gio={gio} dangTai={dangTai} taiLai={taiLai} onMua={() => setBuoc("xacNhan")} />
        )}
        {buoc === "xacNhan" && gio && (
          <BuocXacNhan
            gio={gio}
            onXong={(kq) => {
              setKetQua(kq);
              setBuoc("xong");
              taiLai();
            }}
          />
        )}
        {buoc === "xong" && ketQua && <BuocXong ketQua={ketQua} onDong={dong} />}
      </aside>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Bước 1 — giỏ
// ───────────────────────────────────────────────────────────────────

function BuocGio({
  gio,
  dangTai,
  taiLai,
  onMua,
}: {
  gio: CartOrder | null;
  dangTai: boolean;
  taiLai: () => void;
  onMua: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loi, setLoi] = useState("");

  async function doi(itemId: string, viec: () => Promise<unknown>) {
    setBusyId(itemId);
    setLoi("");
    try {
      await viec();
      taiLai();
    } catch (err) {
      setLoi(err instanceof Error ? err.message : "Không cập nhật được giỏ.");
    } finally {
      setBusyId(null);
    }
  }

  if (dangTai && !gio) {
    return <p className={`muted ${styles.than}`}>Đang tải giỏ…</p>;
  }
  if (!gio || gio.items.length === 0) {
    return (
      <div className={styles.trong}>
        <ShoppingCart size={40} strokeWidth={1.25} aria-hidden="true" />
        <p>Giỏ hàng trống.</p>
        <p className="muted">Bình luận mã sản phẩm trong phiên, AI sẽ bỏ vào giỏ cho bạn.</p>
      </div>
    );
  }

  const soMon = gio.items.reduce((t, i) => t + i.quantity, 0);

  return (
    <>
      <ul className={styles.danhSach}>
        {gio.items.map((item) => (
          <li key={item.id} className={styles.mon} data-testid="mon-trong-gio">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.anh} src={item.imageUrl} alt="" loading="lazy" />
            ) : (
              <span className={styles.anhTrong} aria-hidden="true" />
            )}
            <div className={styles.monThan}>
              <strong>{item.productName || item.skuCode || `Mã ${item.skuId}`}</strong>
              <span className="muted">
                {item.variantName ? `${item.variantName} · ` : ""}{item.skuCode}
              </span>
              <span className={styles.gia}>{formatMoney(Number(item.unitPrice))}</span>
              <div className={styles.soLuong} role="group" aria-label={`Số lượng ${item.productName ?? item.skuCode ?? ""}`}>
                <button
                  type="button"
                  aria-label="Giảm số lượng"
                  disabled={busyId !== null || item.quantity <= 1}
                  onClick={() => doi(item.id, () => cartApi.setQuantity(item.id, item.quantity - 1))}
                >
                  <Minus size={14} aria-hidden="true" />
                </button>
                <span aria-live="polite">{item.quantity}</span>
                <button
                  type="button"
                  aria-label="Tăng số lượng"
                  disabled={busyId !== null || item.quantity >= 100}
                  onClick={() => doi(item.id, () => cartApi.setQuantity(item.id, item.quantity + 1))}
                >
                  <Plus size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.nutXoa}
                  aria-label={`Bỏ ${item.productName ?? item.skuCode ?? "món"} khỏi giỏ`}
                  disabled={busyId !== null}
                  onClick={() => doi(item.id, () => cartApi.remove(item.id))}
                >
                  <Trash2 size={14} aria-hidden="true" /> Xoá
                </button>
              </div>
            </div>
            <strong className={styles.thanhTien}>{formatMoney(item.quantity * Number(item.unitPrice))}</strong>
          </li>
        ))}
      </ul>
      {loi && <p className="notice notice-danger" role="alert">{loi}</p>}
      <footer className={styles.chan}>
        <div className={styles.tong}>
          <span>Tạm tính ({soMon} sản phẩm)</span>
          <strong>{formatMoney(Number(gio.totalAmount))}</strong>
        </div>
        <p className="muted">Hàng chỉ được trừ kho khi bạn xác nhận; phí ship shop báo sau khi chốt địa chỉ.</p>
        <Button onClick={onMua} disabled={busyId !== null} className={styles.nutChinh}>
          Xác nhận mua hàng
        </Button>
      </footer>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────
// Bước 2 — địa chỉ + cách trả + xác nhận (giữ tồn ở đây)
// ───────────────────────────────────────────────────────────────────

function BuocXacNhan({
  gio,
  onXong,
}: {
  gio: CartOrder;
  onXong: (kq: { token: string; amount: string; phuongThuc: PhuongThuc }) => void;
}) {
  const soDiaChi = useApi(() => addressBookApi.list(), []);
  const [chonDiaChiId, setChonDiaChiId] = useState<string | null>(null);
  const [hopThoai, setHopThoai] = useState<"chon" | "them" | null>(null);
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<PhuongThuc>("COD");
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState("");

  const dsDiaChi = soDiaChi.data ?? null;
  const diaChiChon: UserAddress | null = dsDiaChi
    ? dsDiaChi.find((d) => d.id === chonDiaChiId) ?? dsDiaChi.find((d) => d.isDefault) ?? dsDiaChi[0] ?? null
    : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !diaChiChon || !gio.confirmToken) return;
    setBusy(true);
    setLoi("");
    try {
      await ordersApi.confirm(gio.confirmToken, {
        recipientName: diaChiChon.recipientName,
        recipientPhone: diaChiChon.recipientPhone,
        provinceName: diaChiChon.provinceName,
        wardCode: diaChiChon.wardCode,
        streetLine: diaChiChon.streetLine,
        note: note.trim(),
        paymentMethod: payment,
      });
      onXong({ token: gio.confirmToken, amount: gio.totalAmount, phuongThuc: payment });
    } catch (err) {
      setLoi(loiXacNhan(err, gio.items));
    } finally {
      setBusy(false);
    }
  }

  const soMon = gio.items.reduce((t, i) => t + i.quantity, 0);

  return (
    <>
      <form id="form-gio-xac-nhan" className={styles.formXacNhan} onSubmit={submit}>
        <section className={styles.khoi}>
          <DiaChiNhanHang
            dangTai={!dsDiaChi && !soDiaChi.error}
            diaChi={diaChiChon}
            onDoi={() => setHopThoai("chon")}
            onThem={() => setHopThoai("them")}
          />
        </section>

        <section className={styles.khoi}>
          <h3>Phương thức thanh toán</h3>
          <div className={styles.cachTraDanhSach}>
            <ChonCachTra value="COD" chon={payment} onChon={setPayment} ten="COD – Thanh toán khi nhận hàng" mo="Kiểm tra hàng rồi trả tiền mặt." />
            <ChonCachTra value="ONLINE" chon={payment} onChon={setPayment} ten="Chuyển khoản / ví điện tử" mo="Quét QR hoặc chọn cổng ngay sau khi xác nhận." />
          </div>
        </section>

        <section className={styles.khoi}>
          <label htmlFor="gio-note">Ghi chú cho shipper (không bắt buộc)</label>
          <textarea id="gio-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Giao giờ hành chính, gọi trước khi giao." />
        </section>

        <section className={styles.khoi}>
          <h3>Đơn hàng ({soMon} sản phẩm)</h3>
          <ul className={styles.tomTat}>
            {gio.items.map((i) => (
              <li key={i.id}>
                <span>{i.quantity} × {i.productName || i.skuCode}</span>
                <span>{formatMoney(i.quantity * Number(i.unitPrice))}</span>
              </li>
            ))}
          </ul>
        </section>

        {loi && <p className="notice notice-danger" role="alert">{loi}</p>}
      </form>

      <footer className={styles.chan}>
        <div className={styles.tong}>
          <span>Tổng tiền hàng</span>
          <strong>{formatMoney(Number(gio.totalAmount))}</strong>
        </div>
        <Button type="submit" form="form-gio-xac-nhan" disabled={busy || !diaChiChon} className={styles.nutChinh}>
          {busy ? "Đang xác nhận…" : "Xác nhận đơn hàng"}
        </Button>
      </footer>

      {hopThoai === "chon" && dsDiaChi && (
        <ChonDiaChiDialog
          items={dsDiaChi}
          chonId={diaChiChon?.id ?? null}
          onChon={setChonDiaChiId}
          onClose={() => setHopThoai(null)}
          onDoi={() => soDiaChi.reload()}
        />
      )}
      {hopThoai === "them" && (
        <AddressFormDialog
          banDau={null}
          laDauTien={(dsDiaChi?.length ?? 0) === 0}
          onClose={() => setHopThoai(null)}
          onSaved={(d) => {
            setChonDiaChiId(d.id);
            setHopThoai(null);
            soDiaChi.reload();
          }}
        />
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────
// Bước 3 — đã chốt
// ───────────────────────────────────────────────────────────────────

function BuocXong({
  ketQua,
  onDong,
}: {
  ketQua: { token: string; amount: string; phuongThuc: PhuongThuc };
  onDong: () => void;
}) {
  return (
    <>
      <div className={styles.than}>
        {ketQua.phuongThuc === "COD" ? (
          <div className="notice notice-info" role="status">
            <strong>Đã chốt đơn.</strong> Bạn thanh toán bằng tiền mặt khi nhận hàng. Shop sẽ đóng gói và bàn giao cho đơn vị vận chuyển.
          </div>
        ) : (
          <>
            <div className="notice notice-info" role="status">
              <strong>Đã chốt đơn.</strong> Chọn cổng hoặc quét QR để thanh toán ngay.
            </div>
            <CustomerOnlinePayment token={ketQua.token} amount={ketQua.amount} />
            <CustomerBankTransfer token={ketQua.token} />
          </>
        )}
      </div>
      <footer className={styles.chan}>
        <Link className="button button-secondary" href="/orders" onClick={onDong}>Xem đơn mua</Link>
        <Button onClick={onDong}>Tiếp tục xem live</Button>
      </footer>
    </>
  );
}
