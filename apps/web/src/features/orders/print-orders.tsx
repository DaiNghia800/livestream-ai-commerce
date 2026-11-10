"use client";

/**
 * In phiếu giao hàng loạt.
 *
 * Danh sách đơn chỉ có dữ liệu tóm tắt, mà phiếu giao cần địa chỉ và
 * từng dòng hàng — nên phải gọi chi tiết cho từng đơn. Tải lần lượt
 * theo lô nhỏ thay vì bắn hết một lúc: một phiên live có thể có hàng
 * trăm đơn, mở ngần ấy kết nối cùng lúc là trình duyệt tự chặn bớt và
 * vài đơn trả về lỗi.
 */

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ordersApi, type OrderDetail } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { orderStatuses, paymentMethods } from "./labels";
import styles from "./print-orders.module.css";

/** Số đơn in một lần. Quá nhiều thì bản xem trước nặng và lâu. */
export const GIOI_HAN_IN = 60;

/** Số yêu cầu chạy song song khi tải chi tiết. */
const LO = 6;

export async function taiChiTiet(
  orderCodes: string[],
  onProgress?: (xong: number, tong: number) => void,
): Promise<OrderDetail[]> {
  const ketQua: OrderDetail[] = [];

  for (let i = 0; i < orderCodes.length; i += LO) {
    const lo = orderCodes.slice(i, i + LO);
    const phan = await Promise.all(
      lo.map((code) =>
        ordersApi.detail(code).catch(() => null),
      ),
    );
    // Đơn nào lỗi thì bỏ qua, không được để một đơn hỏng chặn cả lượt in.
    ketQua.push(...phan.filter((d): d is OrderDetail => d !== null));
    onProgress?.(Math.min(i + LO, orderCodes.length), orderCodes.length);
  }

  return ketQua;
}

/**
 * Mở hộp thoại in của trình duyệt.
 *
 * Gắn lớp `printing` lên thẻ <html> để CSS in biết phải giấu toàn bộ
 * giao diện và chỉ chừa lại khu vực phiếu. Gỡ lớp ngay sau khi đóng
 * hộp thoại, nếu không lần in sau của trang khác cũng bị giấu theo.
 */
export function moHopThoaiIn(): void {
  const html = document.documentElement;
  html.classList.add("printing");

  const dong = () => {
    html.classList.remove("printing");
    window.removeEventListener("afterprint", dong);
  };
  window.addEventListener("afterprint", dong);

  window.print();

  // Một số trình duyệt không bắn `afterprint`. Gỡ lớp sau một nhịp để
  // trang không kẹt ở trạng thái ẩn.
  setTimeout(dong, 1000);
}

export function PrintableOrders({ orders }: { orders: OrderDetail[] }) {
  // Chờ gắn vào DOM rồi mới dựng cổng: `document` không tồn tại lúc
  // render phía server.
  //
  // Dùng useSyncExternalStore thay cho cặp useState + useEffect: nó
  // trả thẳng hai giá trị khác nhau cho server và trình duyệt, không
  // phải đặt state trong effect (việc mà quy tắc lint của React cấm
  // vì gây một vòng render nối tiếp).
  const daGan = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!daGan) return null;

  /*
   * Đặt khu vực phiếu làm CON TRỰC TIẾP của <body>.
   *
   * CSS in giấu mọi thứ bằng `body > *:not(#print-root)`. Để phiếu
   * nằm lồng trong <main> thì chính <main> bị giấu, và phiếu ở bên
   * trong bị giấu theo — in ra trang trắng mà trên màn hình không có
   * dấu hiệu gì.
   */
  return createPortal(
    <div id="print-root" className={styles.root} aria-hidden="true">
      {orders.map((order) => (
        <article className={styles.slip} key={order.id}>
          <header className={styles.head}>
            <div>
              <p className={styles.eyebrow}>PHIẾU GIAO HÀNG</p>
              <h2 className={styles.code}>{order.orderCode}</h2>
            </div>
            <div className={styles.meta}>
              <p>{formatDateTime(order.createdAt)}</p>
              <p>
                {orderStatuses[order.status]?.label ?? order.status}
              </p>
            </div>
          </header>

          <section className={styles.who}>
            <div>
              <p className={styles.label}>Người nhận</p>
              <p className={styles.strong}>{order.recipientName ?? "—"}</p>
              <p>{order.recipientPhone ?? "—"}</p>
            </div>
            <div>
              <p className={styles.label}>Địa chỉ giao</p>
              <p>{order.shippingAddress ?? "—"}</p>
            </div>
          </section>

          <table className={styles.items}>
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Mã SKU</th>
                <th className={styles.num}>SL</th>
                <th className={styles.num}>Đơn giá</th>
                <th className={styles.num}>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => (
                <tr key={it.id}>
                  <td>
                    {it.productName}
                    {it.variantName ? ` · ${it.variantName}` : ""}
                  </td>
                  <td>{it.skuCode}</td>
                  <td className={styles.num}>{it.quantity}</td>
                  <td className={styles.num}>
                    {formatMoney(Number(it.unitPrice))}
                  </td>
                  <td className={styles.num}>
                    {formatMoney(Number(it.unitPrice) * it.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <footer className={styles.foot}>
            <div>
              <p className={styles.label}>Thanh toán</p>
              <p>
                {order.payment
                  ? `${paymentMethods[order.payment.method] ?? order.payment.method} · ${
                      order.payment.status === "PAID" ? "đã thu" : "chưa thu"
                    }`
                  : "Chưa tạo khoản thu"}
              </p>
              {/* Người giao hàng phải thấy ngay: đơn này không được
                  thu tiền mặt khi giao. */}
              {order.codBlocked && (
                <p className={styles.warn}>KHÔNG thu tiền mặt khi giao</p>
              )}
              {order.note && <p className={styles.note}>Ghi chú: {order.note}</p>}
            </div>
            <div className={styles.total}>
              <p className={styles.label}>Tổng tiền</p>
              <p className={styles.totalValue}>
                {formatMoney(Number(order.totalAmount))}
              </p>
            </div>
          </footer>
        </article>
      ))}
    </div>,
    document.body,
  );
}
