"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  MapPin,
  Printer,
  Sparkles,
  Truck,
  User,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CancelOrderDialog } from "./cancel-order-dialog";
import { formatCountdown, formatDateTime, formatMoney } from "@/lib/format";
import { orderSources, orderStatuses, type Order } from "@/mocks/orders";

const HOLDING = ["DRAFT", "PENDING_CONFIRMATION"];

export function MerchantOrderDetail({ order }: { order: Order }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const holding = HOLDING.includes(order.status);

  useEffect(() => {
    if (!holding) return;
    const id = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, [holding]);

  const remaining =
    order.holdSecondsLeft === null ? null : order.holdSecondsLeft - elapsed;
  const cancellable = !["COMPLETED", "CANCELLED", "EXPIRED"].includes(
    order.status,
  );

  return (
    <>
      <div className="page-head">
        <div>
          <nav className="breadcrumb" aria-label="Đường dẫn trang">
            <Link href="/shop/orders">Đơn hàng</Link>
            <ChevronRight size={14} aria-hidden="true" />
            <span>{order.code}</span>
          </nav>
          <div className="title-row">
            <h1>Chi tiết đơn {order.code}</h1>
            <Badge tone={orderStatuses[order.status].tone}>
              {orderStatuses[order.status].label}
            </Badge>
          </div>
          <p className="muted">
            {orderSources[order.source]} · tạo lúc{" "}
            {formatDateTime(order.createdAt)}
          </p>
        </div>
        <div className="head-actions">
          <Button
            variant="danger"
            disabled={!cancellable}
            onClick={() => setCancelOpen(true)}
            title={cancellable ? undefined : "Đơn này không thể hủy"}
          >
            <XCircle size={17} aria-hidden="true" /> Hủy đơn hàng
          </Button>
          <Button variant="secondary" disabled title="In phiếu chưa khả dụng">
            <Printer size={17} aria-hidden="true" /> In phiếu giao · Sắp có
          </Button>
          <Button variant="secondary" disabled title="Đẩy vận đơn chưa khả dụng">
            <Truck size={17} aria-hidden="true" /> Đẩy sang hãng vận chuyển · Sắp có
          </Button>
        </div>
      </div>

      {remaining !== null && (
        <div
          className={`notice ${remaining > 0 ? "notice-warning" : "notice-danger"}`}
          role={remaining > 0 ? undefined : "alert"}
        >
          <h3>
            {remaining > 0 ? "Đơn đang giữ tồn kho" : "Lượt giữ hàng đã hết hạn"}
          </h3>
          <p>
            {remaining > 0 ? (
              <>
                Còn <span className="countdown">{formatCountdown(remaining)}</span>{" "}
                trước khi hệ thống tự trả hàng về kho và chuyển đơn sang trạng
                thái hết hạn.
              </>
            ) : (
              "Tồn kho đã được trả lại cho phiên. Khách cần chốt lại nếu vẫn muốn mua."
            )}
          </p>
        </div>
      )}

      <div className="detail-grid">
        <div className="stack">
          {order.sourceComment && (
            <Card>
              <div className="section-heading">
                <h2>
                  <Sparkles size={18} aria-hidden="true" /> Bóc tách ý định mua
                  hàng
                </h2>
                <Badge>Chưa kết nối</Badge>
              </div>
              <p className="chat-hint">“{order.sourceComment}”</p>
              <dl className="kv">
                <div>
                  <dt>Mã chốt và số lượng</dt>
                  <dd>
                    {order.items
                      .map((item) => `${item.code} × ${item.quantity}`)
                      .join(" · ")}
                  </dd>
                </div>
                <div>
                  <dt>Phân loại nhận diện</dt>
                  <dd>{order.items.map((item) => item.variant).join(" · ")}</dd>
                </div>
                <div>
                  <dt>Số điện thoại và địa chỉ</dt>
                  <dd>
                    {order.customer.phone} · {order.address}
                  </dd>
                </div>
                <div>
                  <dt>Độ tin cậy</dt>
                  <dd className="muted">Chưa có dữ liệu trong bản mẫu</dd>
                </div>
              </dl>
            </Card>
          )}

          <Card>
            <div className="section-heading">
              <h2>Sản phẩm trong đơn</h2>
              <Badge>{order.items.length} mục</Badge>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <caption className="sr-only">
                  Các dòng hàng thuộc đơn {order.code}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Sản phẩm</th>
                    <th scope="col">Mã chốt / SKU</th>
                    <th scope="col">Phân loại</th>
                    <th scope="col">Đơn giá</th>
                    <th scope="col">SL</th>
                    <th scope="col">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.sku}>
                      <td>
                        <strong>{item.name}</strong>
                      </td>
                      <td>
                        <strong>{item.code}</strong>
                        <p className="muted">{item.sku}</p>
                      </td>
                      <td>{item.variant}</td>
                      <td className="num">{formatMoney(item.unitPrice)}</td>
                      <td className="num">{item.quantity}</td>
                      <td className="num">
                        <strong>
                          {formatMoney(item.unitPrice * item.quantity)}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="money-row">
              <span>Tổng giá trị đơn</span>
              <span>{formatMoney(order.total)}</span>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <div className="section-heading">
              <h2>
                <User size={18} aria-hidden="true" /> Khách hàng
              </h2>
              {order.customer.isVip && <Badge tone="warning">Khách VIP</Badge>}
            </div>
            <dl className="kv">
              <div>
                <dt>Họ và tên</dt>
                <dd>{order.customer.name}</dd>
              </div>
              <div>
                <dt>Số điện thoại</dt>
                <dd>{order.customer.phone}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2>
              <MapPin size={18} aria-hidden="true" /> Địa chỉ nhận hàng
            </h2>
            <p>{order.address}</p>
            {order.note && (
              <div className="notice notice-warning">
                <h3>Ghi chú của khách</h3>
                <p>“{order.note}”</p>
              </div>
            )}
          </Card>

          <Card>
            <div className="section-heading">
              <h2>
                <Truck size={18} aria-hidden="true" /> Vận chuyển
              </h2>
              <Badge>Chưa kết nối</Badge>
            </div>
            {order.shipping ? (
              <dl className="kv">
                <div>
                  <dt>Đơn vị vận chuyển</dt>
                  <dd>{order.shipping.carrier}</dd>
                </div>
                <div>
                  <dt>Mã vận đơn</dt>
                  <dd>{order.shipping.trackingCode}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">
                Chưa tạo vận đơn. Đơn cần được xác nhận trước.
              </p>
            )}
          </Card>

          {order.payment.txnRef && (
            <Card>
              <h2>Thanh toán</h2>
              <p>
                {order.payment.method} ·{" "}
                <Link
                  href={`/shop/payments/${order.payment.txnRef.toLowerCase()}`}
                >
                  {order.payment.txnRef}
                </Link>
              </p>
            </Card>
          )}
        </div>
      </div>

      <CancelOrderDialog
        order={order}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
      />
    </>
  );
}
