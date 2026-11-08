"use client";

/**
 * Màn "Thanh toán" trong phiên live, theo đúng nhịp của TikTok Shop:
 *
 *   Chọn phân loại (sheet của trang live) → "Mua ngay" → MÀN NÀY
 *     1. Địa chỉ nhận hàng (từ sổ của tài khoản, "Thay đổi")
 *     2. Sản phẩm (ảnh, tên, phân loại, số lượng, giá)
 *     3. Vận chuyển
 *     4. Phương thức thanh toán (COD / thanh toán online)
 *     5. Lời nhắn cho shop
 *     6. Chi tiết thanh toán + thanh dưới "Tổng cộng · Đặt hàng"
 *   → Kết quả: COD = đặt hàng thành công; online = bước thanh toán.
 *
 * Đơn là đơn THẬT: từng món vào giỏ server (POST /me/cart/items, nguồn
 * BUTTON, gộp vào giỏ đang mở), rồi xác nhận một lần — tồn chỉ được giữ
 * lúc xác nhận, hết hàng thì báo rõ mã nào thiếu.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Package, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";
import {
  ApiError,
  cartApi,
  layTokenKhach,
  ordersApi,
  type CartOrder,
  type CustomerOrder,
  type UserAddress,
} from "@/lib/api";
import { useDaGan } from "@/lib/use-da-gan";
import { docDiaChi } from "./address-book-dialog";
import { ChonCachTra, loiXacNhan, type PhuongThuc } from "./checkout-parts";
import { ChonDiaChiNhanHang } from "./chon-dia-chi-nhan-hang";
import { CustomerBankTransfer } from "./customer-bank-transfer";
import { CustomerOnlinePayment } from "./customer-online-payment";
import styles from "./live-checkout-dialog.module.css";

export interface LiveCheckoutLine {
  skuId?: string;
  skuCode?: string;
  name: string;
  variantLabel?: string | null;
  quantity: number;
  price: number;
  imageUrl?: string | null;
}

export interface LiveCheckoutResult {
  orderCode: string;
  phuongThuc: PhuongThuc;
  /** Khách muốn bắn thông báo chốt đơn lên chat của phiên. */
  thongBaoChat: boolean;
  order: CustomerOrder;
}

export function LiveCheckoutDialog({
  open,
  livestreamId,
  shopName,
  lines,
  onClose,
  onPlaced,
}: {
  open: boolean;
  /** UUID phiên thật; null = phiên demo, không đặt hàng thật được. */
  livestreamId: string | null;
  shopName?: string;
  lines: LiveCheckoutLine[];
  onClose: () => void;
  onPlaced?: (kq: LiveCheckoutResult) => void;
}) {
  const daGan = useDaGan();
  const daDangNhap = daGan && Boolean(layTokenKhach());

  const [diaChi, setDiaChi] = useState<UserAddress | null>(null);
  const [phuongThuc, setPhuongThuc] = useState<PhuongThuc>("COD");
  const [loiNhan, setLoiNhan] = useState("");
  const [thongBaoChat, setThongBaoChat] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState("");
  const [ketQua, setKetQua] = useState<{
    order: CustomerOrder;
    token: string;
    phuongThuc: PhuongThuc;
  } | null>(null);

  // Đơn online nằm ở AWAITING_PAYMENT cho tới khi tiền về: hỏi lại server
  // để tiêu đề và nội dung chỉ nói "thành công" khi thật sự thành công.
  const donHienTai = useTrangThaiDon(
    ketQua?.token ?? "",
    ketQua?.phuongThuc === "ONLINE",
    ketQua?.order ?? null
  );

  // Đóng là xoá kết quả/lỗi, để lần mở sau (món khác) bắt đầu từ bước thanh toán.
  function dong() {
    setKetQua(null);
    setLoi("");
    setBusy(false);
    onClose();
  }

  const tongTienHang = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const soMon = lines.reduce((s, l) => s + l.quantity, 0);
  const datDuoc = daDangNhap && Boolean(livestreamId) && Boolean(diaChi) && lines.length > 0 && !busy;

  async function datHang() {
    if (!datDuoc || !livestreamId || !diaChi) return;
    setBusy(true);
    setLoi("");
    let gio: CartOrder | null = null;
    try {
      for (const line of lines) {
        gio = await cartApi.addItem({
          livestreamId,
          skuId: line.skuId,
          skuCode: line.skuCode,
          quantity: line.quantity,
        });
      }
      const token = gio?.confirmToken;
      if (!gio || !token) throw new Error("Không tạo được giỏ hàng.");
      const order = await ordersApi.confirm(token, {
        recipientName: diaChi.recipientName,
        recipientPhone: diaChi.recipientPhone,
        provinceName: diaChi.provinceName,
        wardCode: diaChi.wardCode,
        streetLine: diaChi.streetLine,
        note: loiNhan.trim() || undefined,
        paymentMethod: phuongThuc,
      });
      setKetQua({ order, token, phuongThuc });
      onPlaced?.({ orderCode: order.orderCode, phuongThuc, thongBaoChat, order });
    } catch (err) {
      setLoi(
        err instanceof ApiError && err.status === 401
          ? "Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi đặt hàng tiếp."
          : loiXacNhan(err, gio?.items ?? [])
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={dong}
      title={ketQua && donHienTai ? tieuDeKetQua(donHienTai, ketQua.phuongThuc) : "Thanh toán"}
      size="lg"
      footer={null}
    >
      <div className={styles.khung} data-testid="live-checkout">
        {ketQua && donHienTai ? (
          <KetQua order={donHienTai} phuongThuc={ketQua.phuongThuc} token={ketQua.token} diaChi={diaChi} onClose={dong} />
        ) : (
          <>
            <div className={styles.than}>
              {!daDangNhap && (
                <div className="notice notice-warning" role="status">
                  <p>Đăng nhập để đặt hàng và dùng sổ địa chỉ của bạn.</p>
                  <Link className="button button-primary" href="/login">Đăng nhập</Link>
                </div>
              )}
              {daDangNhap && !livestreamId && (
                <div className="notice notice-warning" role="status">
                  <p>Phiên này là phiên demo, chưa nối với shop thật nên không đặt hàng được.</p>
                </div>
              )}

              {/* 1. Địa chỉ nhận hàng */}
              {daDangNhap && (
                <section className={styles.khoi}>
                  <ChonDiaChiNhanHang onChange={setDiaChi} />
                </section>
              )}

              {/* 2. Sản phẩm */}
              <section className={styles.khoi}>
                {shopName && <h3 className={styles.tieuDe}>{shopName}</h3>}
                <ul className={styles.danhSach}>
                  {lines.map((l, i) => (
                    <li key={`${l.skuId ?? l.skuCode ?? l.name}-${i}`} className={styles.mon}>
                      {l.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className={styles.anh} src={l.imageUrl} alt="" />
                      ) : (
                        <span className={styles.anhTrong} aria-hidden="true"><Package size={22} /></span>
                      )}
                      <div className={styles.monThan}>
                        <strong>{l.name}</strong>
                        {l.variantLabel && <span className="muted">{l.variantLabel}</span>}
                        <span className={styles.giaSo}>
                          <span>{formatMoney(l.price)}</span>
                          <span>×{l.quantity}</span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {/* 3. Vận chuyển */}
              <section className={styles.khoi}>
                <h3 className={styles.tieuDe}><Truck size={16} aria-hidden="true" /> Vận chuyển</h3>
                <div className={styles.dong}>
                  <span>Giao hàng tiêu chuẩn</span>
                  <span className="muted">Phí tính khi shop tạo vận đơn</span>
                </div>
              </section>

              {/* 4. Phương thức thanh toán */}
              <section className={styles.khoi}>
                <h3 className={styles.tieuDe}>Phương thức thanh toán</h3>
                <div className={styles.cachTra}>
                  <ChonCachTra value="COD" chon={phuongThuc} onChon={setPhuongThuc} ten="Thanh toán khi nhận hàng" mo="Trả tiền mặt cho người giao" />
                  <ChonCachTra value="ONLINE" chon={phuongThuc} onChon={setPhuongThuc} ten="Thanh toán online" mo="VNPay, MoMo, ZaloPay hoặc chuyển khoản QR — môi trường thử" />
                </div>
              </section>

              {/* 5. Lời nhắn cho shop */}
              <section className={styles.khoi}>
                <label className={styles.nhan} htmlFor="live-checkout-note">Lời nhắn cho shop</label>
                <input
                  id="live-checkout-note"
                  className="dialog-input"
                  value={loiNhan}
                  onChange={(e) => setLoiNhan(e.target.value)}
                  maxLength={500}
                  placeholder="VD: Giao giờ hành chính, gọi trước khi giao…"
                />
                <label className={styles.checkbox}>
                  <input type="checkbox" checked={thongBaoChat} onChange={(e) => setThongBaoChat(e.target.checked)} />
                  <span>Bắn thông báo chốt đơn lên livestream</span>
                </label>
              </section>

              {/* 6. Chi tiết thanh toán */}
              <section className={styles.khoi}>
                <h3 className={styles.tieuDe}>Chi tiết thanh toán</h3>
                <div className={styles.dong}><span>Tổng tiền hàng ({soMon} món)</span><span>{formatMoney(tongTienHang)}</span></div>
                <div className={styles.dong}><span>Phí vận chuyển</span><span className="muted">Tính sau</span></div>
                <div className={`${styles.dong} ${styles.tong}`}><span>Tổng thanh toán</span><strong>{formatMoney(tongTienHang)}</strong></div>
              </section>

              {loi && <div className="notice notice-danger" role="alert">{loi}</div>}
            </div>

            <div className={styles.chan}>
              <div className={styles.chanTong}>
                <span className="muted">Tổng cộng</span>
                <strong>{formatMoney(tongTienHang)}</strong>
              </div>
              <Button type="button" className={styles.nutDat} disabled={!datDuoc} onClick={() => void datHang()}>
                {busy ? "Đang đặt hàng…" : "Đặt hàng"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Đơn chọn online nằm ở AWAITING_PAYMENT cho tới khi tiền về: server giữ
 * hàng rồi chuyển CONFIRMED (hay huỷ nếu hết hàng). Hỏi lại trạng thái
 * mỗi 5 giây để màn hình chỉ nói "thành công" khi thật sự thành công.
 */
function useTrangThaiDon(token: string, theoDoi: boolean, banDau: CustomerOrder | null) {
  // Bản mới nhất đọc từ server; null = chưa hỏi lần nào, dùng bản lúc đặt.
  const [moi, setMoi] = useState<CustomerOrder | null>(null);
  const don = moi && moi.id === banDau?.id ? moi : banDau;
  const dangCho = theoDoi && don?.status === "AWAITING_PAYMENT";
  useEffect(() => {
    if (!dangCho || !token) return;
    let huy = false;
    const hoi = async () => {
      try {
        const kq = await ordersApi.confirmPreview(token);
        if (!huy) setMoi(kq);
      } catch {
        // Mạng chập một nhịp: lần hỏi sau vẫn chạy.
      }
    };
    const id = setInterval(hoi, 5000);
    return () => {
      huy = true;
      clearInterval(id);
    };
  }, [token, dangCho]);
  return don;
}

function tieuDeKetQua(order: CustomerOrder, phuongThuc: PhuongThuc): string {
  if (phuongThuc === "COD") return "Đặt hàng thành công";
  if (order.status === "AWAITING_PAYMENT") return "Chờ thanh toán";
  if (order.status === "CANCELLED") return "Đơn đã huỷ";
  return "Đặt hàng thành công";
}

function KetQua({
  order,
  phuongThuc,
  token,
  diaChi,
  onClose,
}: {
  order: CustomerOrder;
  phuongThuc: PhuongThuc;
  token: string;
  diaChi: UserAddress | null;
  onClose: () => void;
}) {
  const choTien = phuongThuc === "ONLINE" && order.status === "AWAITING_PAYMENT";
  const hetHang = order.status === "CANCELLED" && order.cancelReason === "OUT_OF_STOCK_AT_PAYMENT";
  const daGiuHang = order.status !== "AWAITING_PAYMENT" && order.status !== "CANCELLED";
  return (
    <div className={styles.ketQua} data-testid="live-checkout-ket-qua" data-trang-thai={order.status}>
      <div className={`${styles.ketQuaDau} ${hetHang ? styles.ketQuaLoi : ""}`}>
        <CheckCircle2 size={40} aria-hidden="true" />
        <h4>
          {hetHang
            ? "Hết hàng đúng lúc tiền về"
            : choTien
              ? "Đơn đã ghi nhận, mời bạn thanh toán"
              : phuongThuc === "ONLINE"
                ? "Thanh toán thành công, hàng đã được giữ!"
                : "Đặt hàng thành công!"}
        </h4>
        <p className="muted">Mã đơn hàng: <strong>{order.orderCode}</strong></p>
        {choTien && (
          <p className="muted">
            Hàng <strong>chưa được giữ</strong> cho tới khi tiền về. Trang sẽ tự báo khi
            cổng xác nhận đã thu.
          </p>
        )}
        {hetHang && (
          <p className="muted">Đơn đã bị huỷ; shop sẽ hoàn lại số tiền bạn đã chuyển.</p>
        )}
      </div>

      <dl className={`kv ${styles.tomTat}`}>
        {order.items.map((it) => (
          <div key={it.id}>
            <dt>{it.productName ?? it.skuCode}{it.variantName ? ` · ${it.variantName}` : ""}</dt>
            <dd>×{it.quantity} · {formatMoney(Number(it.unitPrice) * it.quantity)}</dd>
          </div>
        ))}
        {diaChi && (
          <>
            <div><dt>Người nhận</dt><dd>{diaChi.recipientName} ({diaChi.recipientPhone})</dd></div>
            {/* Địa chỉ phải đọc được trọn vẹn, không cắt ba chấm. */}
            <div><dt>Giao tới</dt><dd className={styles.diaChiDu}>{docDiaChi(diaChi)}</dd></div>
          </>
        )}
        <div><dt>Tổng thanh toán</dt><dd><strong>{formatMoney(Number(order.totalAmount))}</strong></dd></div>
      </dl>

      {choTien && (
        <div className={styles.thanhToan} data-testid="buoc-thanh-toan">
          <CustomerOnlinePayment token={token} amount={order.totalAmount} />
          <CustomerBankTransfer token={token} />
        </div>
      )}

      <div className={styles.ketQuaNut}>
        <Link className="button button-secondary" href="/orders">Xem đơn hàng</Link>
        <Button type="button" onClick={onClose}>
          {choTien ? "Thanh toán sau, tiếp tục xem live" : "Tiếp tục xem live"}
        </Button>
        {daGiuHang && phuongThuc === "ONLINE" && (
          <p className="muted">Shop sẽ đóng gói và bàn giao cho đơn vị vận chuyển.</p>
        )}
      </div>
    </div>
  );
}
