import Link from "next/link";
import { ChevronRight, History, ReceiptText, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatClock, formatDateTime, formatMoney } from "@/lib/format";
import { findOrder } from "@/mocks/orders";
import {
  paymentGateways,
  paymentStatuses,
  type Payment,
} from "@/mocks/payments";

export function MerchantPaymentDetail({ payment }: { payment: Payment }) {
  const order = findOrder(payment.orderCode);
  const { gross, discount, fee } = payment.breakdown;
  const net = gross - discount;

  return (
    <>
      <div className="page-head">
        <div>
          <nav className="breadcrumb" aria-label="Đường dẫn trang">
            <Link href="/shop/payments">Thanh toán</Link>
            <ChevronRight size={14} aria-hidden="true" />
            <span>{payment.txnRef}</span>
          </nav>
          <div className="title-row">
            <h1>Giao dịch {payment.txnRef}</h1>
            <Badge tone={paymentStatuses[payment.status].tone}>
              {paymentStatuses[payment.status].label}
            </Badge>
          </div>
          <p className="muted">
            {paymentGateways[payment.gateway]} · tạo lúc{" "}
            {formatDateTime(payment.createdAt)}
            {payment.settledAt &&
              ` · hoàn tất ${formatClock(payment.settledAt)}`}
          </p>
        </div>
      </div>

      <div className="detail-grid">
        <div className="stack">
          <Card>
            <div className="section-heading">
              <h2>
                <ReceiptText size={18} aria-hidden="true" /> Dòng tiền
              </h2>
              <Badge>Chưa kết nối</Badge>
            </div>
            <div className="money-row">
              <span>Giá trị đơn gốc</span>
              <span>{formatMoney(gross)}</span>
            </div>
            <div className="money-row">
              <span>Khuyến mãi trong phiên</span>
              <span>{discount ? `− ${formatMoney(discount)}` : "—"}</span>
            </div>
            <div className="money-row">
              <span>Khách thực trả</span>
              <span>{formatMoney(net)}</span>
            </div>
            <div className="money-row">
              <span>Phí cổng thanh toán</span>
              <span>{fee ? `− ${formatMoney(fee)}` : "—"}</span>
            </div>
            <div className="money-row">
              <span>Shop thực nhận</span>
              <span>{formatMoney(net - fee)}</span>
            </div>
          </Card>

          <Card>
            <div className="section-heading">
              <h2>
                <History size={18} aria-hidden="true" /> Nhật ký giao dịch
              </h2>
              <Badge>Dữ liệu minh họa</Badge>
            </div>
            <ol className="timeline">
              {payment.timeline.map((event) => (
                <li key={event.at}>
                  <time dateTime={event.at}>{formatClock(event.at)}</time>
                  <strong>{event.title}</strong>
                  <p className="muted">{event.detail}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <div className="section-heading">
              <h2>Đơn hàng liên kết</h2>
              <Badge>{payment.orderCode}</Badge>
            </div>
            {order ? (
              <>
                <dl className="kv">
                  <div>
                    <dt>Khách hàng</dt>
                    <dd>{order.customer.name}</dd>
                  </div>
                  <div>
                    <dt>Số điện thoại</dt>
                    <dd>{order.customer.phone}</dd>
                  </div>
                  <div>
                    <dt>Sản phẩm</dt>
                    <dd>
                      {order.items
                        .map((item) => `${item.name} × ${item.quantity}`)
                        .join(", ")}
                    </dd>
                  </div>
                </dl>
                <p>
                  <Link href={`/shop/orders/${order.code.toLowerCase()}`}>
                    Xem chi tiết đơn {order.code}
                    <ChevronRight size={14} aria-hidden="true" />
                  </Link>
                </p>
              </>
            ) : (
              <p className="muted">Không tìm thấy đơn hàng tương ứng.</p>
            )}
          </Card>

          <Card>
            <div className="section-heading">
              <h2>
                <Warehouse size={18} aria-hidden="true" /> Tồn kho
              </h2>
              <Badge>Chưa kết nối</Badge>
            </div>
            <dl className="kv">
              <div>
                <dt>Trạng thái lượt giữ</dt>
                <dd>
                  {payment.status === "PAID"
                    ? "COMMITTED · đã trừ tồn thật"
                    : payment.status === "PENDING"
                      ? "HELD · đang giữ chỗ"
                      : "RELEASED · đã trả về kho"}
                </dd>
              </div>
              {order && (
                <div>
                  <dt>Mã SKU</dt>
                  <dd>{order.items.map((item) => item.sku).join(", ")}</dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
