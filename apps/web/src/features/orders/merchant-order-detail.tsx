"use client";
import { useCallback, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  CreditCard,
  History,
  MapPin,
  Package,
  Printer,
  RotateCcw,
  Truck,
  User,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { CancelOrderDialog } from "./cancel-order-dialog";
import { formatCountdown, formatDateTime, formatMoney } from "@/lib/format";
import { ordersApi, paymentsApi, type OrderDetail } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { moHopThoaiIn, PrintableOrders } from "./print-orders";
import { KHONG_HUY_DUOC } from "./merchant-order-list";
import { useNow } from "@/lib/use-now";
import {
  orderSources,
  orderStatuses,
  paymentMethods,
  paymentStatuses,
} from "./labels";

const HOLDING = ["DRAFT", "PENDING_CONFIRMATION"];

export function MerchantOrderDetail({ orderCode }: { orderCode: string }) {
  const { data, loading, error, reload } = useApi(
    () => ordersApi.detail(orderCode),
    [orderCode],
  );

  if (loading) return <LoadingState />;
  if (error) {
    return error.status === 404 ? (
      <EmptyState
        title={`Không tìm thấy đơn ${orderCode}`}
        description="Mã đơn có thể đã gõ sai, hoặc đơn thuộc shop khác."
      />
    ) : (
      <ErrorState
        action={
          <Button variant="secondary" onClick={reload}>
            Thử lại
          </Button>
        }
      />
    );
  }
  if (!data) return null;

  return <OrderDetailView order={data} onChanged={reload} />;
}

function OrderDetailView({
  order,
  onChanged,
}: {
  order: OrderDetail;
  onChanged: () => void;
}) {
  const [moTay, setMoTay] = useState(false);

  /*
   * Mở hộp thoại huỷ khi địa chỉ kết thúc bằng #huy-don.
   *
   * Nút huỷ ở bảng danh sách trỏ tới đây. Trước đó nó trỏ vào một mỏ
   * neo không tồn tại nên bấm xong chỉ mở trang chi tiết rồi đứng im
   * — người dùng tưởng nút hỏng.
   *
   * Đọc bằng useSyncExternalStore thay vì useState + useEffect: phía
   * server không có `location`, mà đặt state trong effect thì vướng
   * quy tắc lint của React.
   */
  const hash = useSyncExternalStore(
    useCallback((onChange: () => void) => {
      window.addEventListener("hashchange", onChange);
      return () => window.removeEventListener("hashchange", onChange);
    }, []),
    () => window.location.hash,
    () => "",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [thongBao, setThongBao] = useState<string | null>(null);
  const router = useRouter();

  const holding = HOLDING.includes(order.status);
  const now = useNow(holding);

  const remaining =
    !order.heldUntil || !now
      ? null
      : Math.max(0, Math.round((new Date(order.heldUntil).getTime() - now) / 1000));

  const cancellable = !KHONG_HUY_DUOC.includes(order.status);
  // Đơn huỷ và đơn hết hạn đều đã trả hàng về kho, nên cùng một
  // cảnh: muốn mua lại thì phải giữ hàng lại từ đầu.
  const taoLaiDuoc = order.status === "CANCELLED" || order.status === "EXPIRED";
  const cancelOpen = moTay || (hash === "#huy-don" && cancellable);

  function dongHuy() {
    setMoTay(false);
    if (window.location.hash === "#huy-don") {
      // Xoá mỏ neo để F5 không mở lại hộp thoại. replaceState không
      // tự bắn hashchange nên phải báo tay, nếu không giá trị đọc
      // được vẫn là cũ và hộp thoại mở lại ngay.
      history.replaceState(null, "", window.location.pathname);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }
  const meta = orderStatuses[order.status] ?? { label: order.status, tone: "neutral" };

  /**
   * Gói mọi thao tác đổi trạng thái vào một chỗ.
   *
   * Khoá nút trong lúc chờ là bắt buộc: bấm hai lần sẽ gửi hai lệnh,
   * mà lệnh thứ hai nhận 409 rồi hiện thông báo lỗi cho một thao tác
   * thật ra đã thành công.
   */
  async function run(ten: string, fn: () => Promise<unknown>) {
    setBusy(ten);
    setActionError(null);
    setThongBao(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <nav className="breadcrumb" aria-label="Đường dẫn trang">
            <Link href="/shop/orders">Đơn hàng</Link>
            <ChevronRight size={14} aria-hidden="true" />
            <span>{order.orderCode}</span>
          </nav>
          <div className="title-row">
            <h1>Chi tiết đơn {order.orderCode}</h1>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <p className="muted">
            {orderSources[order.source] ?? order.source} · tạo lúc{" "}
            {formatDateTime(order.createdAt)}
          </p>
        </div>
        <div className="head-actions">
          {order.status === "CONFIRMED" && (
            <Button
              disabled={busy !== null}
              onClick={() => run("processing", () => ordersApi.startProcessing(order.id))}
            >
              <Package size={17} aria-hidden="true" />{" "}
              {busy === "processing" ? "Đang lưu…" : "Bắt đầu đóng gói"}
            </Button>
          )}
          {order.status === "PROCESSING" && (
            <Button
              disabled={busy !== null}
              onClick={() => run("complete", () => ordersApi.complete(order.id))}
            >
              <Truck size={17} aria-hidden="true" />{" "}
              {busy === "complete" ? "Đang lưu…" : "Xác nhận đã giao"}
            </Button>
          )}
          {/* Ẩn hẳn thay vì làm mờ: đơn đã giao, đã huỷ hoặc đã hết hạn
              thì không còn gì để huỷ, một nút mờ chỉ làm shop phân vân. */}
          {cancellable && (
            <Button
              variant="danger"
              disabled={busy !== null}
              onClick={() => setMoTay(true)}
            >
              <XCircle size={17} aria-hidden="true" /> Hủy đơn hàng
            </Button>
          )}
          {taoLaiDuoc && (
            <Button
              disabled={busy !== null}
              onClick={() =>
                run("reorder", async () => {
                  const moi = await ordersApi.reorder(order);
                  const thieu = moi.rejected?.length ?? 0;
                  if (thieu > 0) {
                    setThongBao(
                      `Đã tạo đơn ${moi.orderCode}, nhưng ${thieu} mã không còn hàng.`,
                    );
                  }
                  router.push(`/shop/orders/${moi.orderCode}`);
                })
              }
            >
              <RotateCcw size={17} aria-hidden="true" />{" "}
              {busy === "reorder" ? "Đang tạo…" : "Tạo lại đơn"}
            </Button>
          )}
          <Button variant="secondary" onClick={moHopThoaiIn}>
            <Printer size={17} aria-hidden="true" /> In phiếu giao
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="notice notice-danger" role="alert">
          <h3>Không thực hiện được</h3>
          <p>{actionError}</p>
        </div>
      )}

      {/* Đơn ĐÃ hết hạn thì `heldUntil` bị xoá, nên không thể dựa vào
          đồng hồ để biết — phải xét thẳng trạng thái. Trước đây khung
          đỏ này không bao giờ hiện với đơn hết hạn. */}
      {thongBao && (
        <div className="notice notice-warning" role="status">
          <p>{thongBao}</p>
        </div>
      )}

      {taoLaiDuoc && (
        <div className="notice">
          <h3>Đơn này đã đóng, hàng đã trả về kho</h3>
          <p>
            Không khôi phục lại được — hàng có thể đã bán cho khách khác.
            Bấm <strong>Tạo lại đơn</strong> để giữ hàng lại từ đầu; mã nào
            hết sẽ được báo ngay.
          </p>
        </div>
      )}

      {order.status === "EXPIRED" && (
        <div className="notice notice-danger" role="alert">
          <h3>Lượt giữ hàng đã hết hạn</h3>
          <p>
            Tồn kho đã được trả lại cho phiên. Khách cần chốt lại nếu vẫn muốn
            mua.
          </p>
        </div>
      )}

      {remaining !== null && (
        <div
          className={`notice ${remaining > 0 ? "notice-warning" : "notice-danger"}`}
          role={remaining > 0 ? undefined : "alert"}
        >
          <h3>
            {remaining > 0 ? "Đơn đang giữ tồn kho" : "Lượt giữ hàng sắp hết"}
          </h3>
          <p>
            {remaining > 0 ? (
              <>
                Còn{" "}
                <span className="countdown" data-urgent={remaining < 60}>
                  {formatCountdown(remaining)}
                </span>{" "}
                trước khi hệ thống tự trả hàng về kho và chuyển đơn sang trạng
                thái hết hạn.
              </>
            ) : (
              "Job nền sẽ trả hàng về kho trong giây lát."
            )}
          </p>
        </div>
      )}

      {order.codBlocked && (
        <div className="notice notice-warning">
          <h3>Khách này không được thanh toán khi nhận hàng</h3>
          <p>
            Hệ thống đánh dấu dựa trên lịch sử chốt đơn rồi bỏ. Đơn cần được
            chuyển khoản trước hoặc đặt cọc.
          </p>
        </div>
      )}

      <div className="detail-grid">
        <div className="stack">
          <Card>
            <div className="section-heading">
              <h2>Sản phẩm trong đơn</h2>
              <Badge>{order.items.length} mục</Badge>
            </div>
            <div className="table-wrap">
              <table className="data-table data-table-compact">
                <caption className="sr-only">
                  Các dòng hàng thuộc đơn {order.orderCode}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Sản phẩm</th>
                    <th scope="col">Mã SKU</th>
                    <th scope="col">Phân loại</th>
                    <th scope="col" className="num">Đơn giá</th>
                    <th scope="col" className="num">SL</th>
                    <th scope="col" className="num">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.productName}</strong>
                        {/* Giữ được ít hơn khách muốn — BẪY-06. Shop cần
                            thấy ngay để còn nhắn lại khách. */}
                        {item.isPartial && (
                          <p className="muted">
                            Khách muốn {item.requestedQty}, chỉ giữ được{" "}
                            {item.quantity}
                          </p>
                        )}
                      </td>
                      <td>
                        <strong>{item.skuCode}</strong>
                      </td>
                      <td>{item.variantName ?? "—"}</td>
                      <td className="num">{formatMoney(Number(item.unitPrice))}</td>
                      <td className="num">{item.quantity}</td>
                      <td className="num">
                        <strong>
                          {formatMoney(Number(item.unitPrice) * item.quantity)}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="money-row">
              <span>Tổng giá trị đơn</span>
              <span>{formatMoney(Number(order.totalAmount))}</span>
            </div>
          </Card>

          <Card>
            <h2 className="title-icon">
              <History size={18} aria-hidden="true" /> Lịch sử trạng thái
            </h2>
            {order.history.length ? (
              <ol className="timeline">
                {order.history.map((row, i) => (
                  <li key={`${row.changedAt}-${i}`}>
                    <strong>
                      {orderStatuses[row.toStatus as keyof typeof orderStatuses]
                        ?.label ?? row.toStatus}
                    </strong>
                    <p className="muted">
                      {formatDateTime(row.changedAt)}
                      {row.note ? ` · ${row.note}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">Đơn chưa đổi trạng thái lần nào.</p>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card>
            <h2 className="title-icon">
              <User size={18} aria-hidden="true" /> Người nhận
            </h2>
            {order.recipientName ? (
              <dl className="kv">
                <div>
                  <dt>Họ và tên</dt>
                  <dd>{order.recipientName}</dd>
                </div>
                <div>
                  <dt>Số điện thoại</dt>
                  <dd>{order.recipientPhone}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">
                Khách chưa mở link xác nhận nên chưa điền thông tin giao hàng.
              </p>
            )}
          </Card>

          <Card>
            <h2 className="title-icon">
              <MapPin size={18} aria-hidden="true" /> Địa chỉ nhận hàng
            </h2>
            <p>{order.shippingAddress ?? "Chưa có"}</p>
            {order.note && (
              <div className="notice notice-warning">
                <h3>Ghi chú của khách</h3>
                <p>“{order.note}”</p>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="title-icon">
              <CreditCard size={18} aria-hidden="true" /> Thanh toán
            </h2>
            {order.payment ? (
              <>
                <dl className="kv">
                  <div>
                    <dt>Hình thức</dt>
                    <dd>
                      {paymentMethods[order.payment.method] ?? order.payment.method}
                    </dd>
                  </div>
                  <div>
                    <dt>Trạng thái</dt>
                    <dd>
                      <Badge
                        tone={
                          paymentStatuses[
                            order.payment.status as keyof typeof paymentStatuses
                          ]?.tone ?? "neutral"
                        }
                      >
                        {paymentStatuses[
                          order.payment.status as keyof typeof paymentStatuses
                        ]?.label ?? order.payment.status}
                      </Badge>
                    </dd>
                  </div>
                  <div>
                    <dt>Đã nhận</dt>
                    <dd>{formatMoney(Number(order.payment.paidAmount))}</dd>
                  </div>
                </dl>
                {order.payment.txnRef && (
                  <p>
                    <Link
                      className="link-inline"
                      href={`/shop/payments/${order.payment.txnRef}`}
                    >
                      Xem chi tiết khoản thu {order.payment.txnRef}
                    </Link>
                  </p>
                )}
              </>
            ) : (
              <CreatePaymentBox
                orderId={order.id}
                codBlocked={order.codBlocked}
                disabled={!["CONFIRMED", "PROCESSING"].includes(order.status)}
                onCreated={onChanged}
              />
            )}
          </Card>
        </div>
      </div>

      {/* Phiếu dựng sẵn ngay khi mở trang: dữ liệu đã có đủ, không
          cần gọi thêm API nào. Ẩn trên màn hình, chỉ hiện khi in. */}
      <PrintableOrders orders={[order]} />

      <CancelOrderDialog
        orderCode={order.orderCode}
        open={cancelOpen}
        onClose={dongHuy}
        onConfirm={async (reason, note) => {
          await ordersApi.cancel(order.id, reason, note);
          dongHuy();
          onChanged();
        }}
      />
    </>
  );
}

/** Chọn hình thức thu tiền cho đơn chưa có khoản thu. */
function CreatePaymentBox({
  orderId,
  codBlocked,
  disabled,
  onCreated,
}: {
  orderId: string;
  codBlocked: boolean;
  disabled: boolean;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (disabled) {
    return (
      <p className="muted">
        Đơn cần được khách xác nhận trước khi tạo khoản thu.
      </p>
    );
  }

  async function create(method: "COD" | "ONLINE") {
    setBusy(true);
    setErr(null);
    try {
      await paymentsApi.create(orderId, method);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="muted">Đơn chưa có khoản thu.</p>
      <div className="head-actions">
        <Button
          variant="secondary"
          disabled={busy || codBlocked}
          title={codBlocked ? "Khách này không được COD" : undefined}
          onClick={() => create("COD")}
        >
          Thu hộ khi giao
        </Button>
        <Button disabled={busy} onClick={() => create("ONLINE")}>
          Chuyển khoản / ví
        </Button>
      </div>
      {err && (
        <div className="notice notice-danger" role="alert">
          <p>{err}</p>
        </div>
      )}
    </>
  );
}
