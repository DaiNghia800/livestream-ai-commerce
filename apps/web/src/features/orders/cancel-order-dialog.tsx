"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

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
  orderCode,
  open,
  onClose,
  onConfirm,
}: {
  orderCode: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, note?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const needsNote = reason === "OTHER";
  const noteMissing = needsNote && note.trim().length === 0;
  const blocked = reason === "" || noteMissing || busy;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (blocked) return;

    setBusy(true);
    setError("");
    try {
      await onConfirm(reason, note.trim() || undefined);
      // Dọn sạch form trước khi đóng, nếu không lần mở sau vẫn còn lý
      // do của đơn trước và nhân viên dễ bấm nhầm.
      setReason("");
      setNote("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`Xác nhận hủy đơn ${orderCode}`}
      footer={
        <div className="dialog-footer">
          <Button variant="secondary" autoFocus onClick={onClose} disabled={busy}>
            Giữ lại đơn
          </Button>
          <Button
            variant="danger"
            form="cancel-order-form"
            type="submit"
            disabled={blocked}
          >
            {busy ? "Đang hủy…" : "Xác nhận hủy và trả tồn"}
          </Button>
        </div>
      }
    >
      <div className="notice notice-warning">
        <h3>Hủy đơn sẽ kéo theo</h3>
        <ol>
          <li>Toàn bộ hàng đang giữ được trả ngay về tồn khả dụng của phiên.</li>
          <li>
            Nếu khách đã chuyển khoản, khoản thu <strong>không</strong> tự hoàn
            — phải bấm hoàn tiền ở màn thanh toán.
          </li>
          <li>Đơn vẫn được giữ lại để đối soát, không bị xóa khỏi hệ thống.</li>
        </ol>
      </div>

      <form id="cancel-order-form" onSubmit={submit}>
        <fieldset
          style={{ border: 0, margin: 0, padding: 0 }}
          aria-describedby="cancel-reason-hint"
        >
          <legend>
            <strong>Lý do hủy đơn</strong>
          </legend>
          <p className="muted" id="cancel-reason-hint">
            Lý do được ghi vào nhật ký để đối soát tồn kho sau phiên. Chọn
            “Nghi ngờ đơn ảo” sẽ cộng điểm rủi ro cho khách này.
          </p>
          <div className="radio-list">
            {reasons.map((item) => (
              <label className="radio-option" key={item.value}>
                <input
                  type="radio"
                  name="cancel-reason"
                  value={item.value}
                  checked={reason === item.value}
                  disabled={busy}
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
            disabled={busy}
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

      {error && (
        <div className="notice notice-danger" role="alert">
          <h3>Không hủy được đơn</h3>
          <p>{error}</p>
        </div>
      )}
    </Dialog>
  );
}
