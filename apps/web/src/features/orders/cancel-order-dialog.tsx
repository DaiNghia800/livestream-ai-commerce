"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";
import { type Order } from "@/mocks/orders";

const reasons = [
  { value: "CUSTOMER_CANCEL", label: "Khách yêu cầu hủy qua chat hoặc điện thoại" },
  { value: "WRONG_ADDRESS", label: "Sai lệch địa chỉ hoặc không liên lạc được" },
  { value: "OUT_OF_STOCK", label: "Hết hàng hoặc lệch tồn kho thực tế" },
  { value: "DUPLICATE", label: "Khách đặt trùng đơn trong phiên" },
  { value: "SUSPECTED_FRAUD", label: "Nghi ngờ đơn ảo hoặc bom hàng" },
  { value: "OTHER", label: "Lý do khác" },
] as const;

const NOTE_LIMIT = 250;

export function CancelOrderDialog({
  order,
  open,
  onClose,
}: {
  order: Order;
  open: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");

  const heldQuantity = order.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const needsNote = reason === "OTHER";
  const noteMissing = needsNote && note.trim().length === 0;
  const blocked = reason === "" || noteMissing;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`Xác nhận hủy đơn ${order.code}`}
      footer={
        <div className="dialog-footer">
          <Button variant="secondary" autoFocus onClick={onClose}>
            Giữ lại đơn
          </Button>
          <Button
            variant="danger"
            form="cancel-order-form"
            type="submit"
            disabled={blocked}
          >
            Xác nhận hủy và trả tồn
          </Button>
        </div>
      }
    >
      <p className="muted">
        {order.customer.name} · {formatMoney(order.total)}
      </p>

      <div className="notice notice-warning">
        <h3>Hủy đơn sẽ kéo theo</h3>
        <ol>
          <li>
            Trả <strong>{heldQuantity} sản phẩm</strong> đang giữ chỗ về tồn khả
            dụng của phiên.
          </li>
          {order.payment.status === "PAID" && (
            <li>
              Khách đã thanh toán {formatMoney(order.total)} qua{" "}
              {order.payment.method} — cần hoàn tiền thủ công.
            </li>
          )}
          {order.shipping && (
            <li>
              Vận đơn {order.shipping.trackingCode} của {order.shipping.carrier}{" "}
              phải được hủy riêng.
            </li>
          )}
        </ol>
      </div>

      <form
        id="cancel-order-form"
        onSubmit={(event) => {
          event.preventDefault();
          setNotice("Bản mẫu · chưa kết nối dịch vụ hủy đơn.");
        }}
      >
        <fieldset
          style={{ border: 0, margin: 0, padding: 0 }}
          aria-describedby="cancel-reason-hint"
        >
          <legend>
            <strong>Lý do hủy đơn</strong>
          </legend>
          <p className="muted" id="cancel-reason-hint">
            Lý do được ghi vào nhật ký để đối soát tồn kho sau phiên.
          </p>
          <div className="radio-list">
            {reasons.map((item) => (
              <label className="radio-option" key={item.value}>
                <input
                  type="radio"
                  name="cancel-reason"
                  value={item.value}
                  checked={reason === item.value}
                  onChange={(event) => setReason(event.target.value)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field" style={{ marginTop: "var(--space-4)" }}>
          <label htmlFor="cancel-note">
            Ghi chú nội bộ {needsNote && "(bắt buộc)"}
          </label>
          <textarea
            id="cancel-note"
            maxLength={NOTE_LIMIT}
            value={note}
            aria-invalid={noteMissing || undefined}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Thông tin thêm cho bộ phận kho và chăm sóc khách hàng…"
          />
          <span className="char-count">
            {note.length}/{NOTE_LIMIT} ký tự
          </span>
          {noteMissing && (
            <span className="field-error">
              Chọn “Lý do khác” thì phải ghi rõ lý do.
            </span>
          )}
        </div>
      </form>

      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
    </Dialog>
  );
}
