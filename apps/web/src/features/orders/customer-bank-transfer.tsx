"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { paymentsApi } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import styles from "./customer-order-confirmation.module.css";

export function CustomerBankTransfer({ token }: { token: string }) {
  const { data, error, loading, reload } = useApi(() => paymentsApi.customerTransfer(token), [token]);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (data?.status !== "PENDING") return;
    const timer = window.setInterval(reload, 5000);
    return () => window.clearInterval(timer);
  }, [data?.status, reload]);

  async function create() {
    if (busy) return;
    setBusy(true);
    setSubmitError("");
    try {
      await paymentsApi.createCustomerTransfer(token);
      reload();
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "Không tạo được khoản thanh toán.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(`Đã sao chép ${label}.`);
    } catch {
      setCopied("Không sao chép được. Vui lòng chọn và sao chép thủ công.");
    }
  }

  return (
    <Card>
      <h2>Thanh toán chuyển khoản</h2>
      {loading && <p className="muted">Đang kiểm tra thanh toán…</p>}
      {error && <div className="notice notice-danger" role="alert">Không tải được trạng thái thanh toán. <Button variant="secondary" onClick={reload}>Thử lại</Button></div>}
      {data && (
        <>
          {data.status === "PAID" ? (
            <div className="notice notice-info" role="status">Đã nhận đủ {formatMoney(Number(data.amount))}. Cảm ơn bạn!</div>
          ) : data.status === "PENDING" && data.available ? (
            <div className={styles.transfer}>
              <div className="notice notice-warning" role="status">
                Đây là <strong>môi trường thử nghiệm SePay</strong>. Chỉ mô phỏng giao dịch trong Test mode; không chuyển tiền thật vào tài khoản này.
              </div>
              <p>Đang chờ ghi nhận thanh toán. Trang sẽ tự cập nhật khi hệ thống nhận webhook thử nghiệm.</p>
              {Number(data.paidAmount) > 0 && <p>Đã nhận {formatMoney(Number(data.paidAmount))}; còn thiếu {formatMoney(Number(data.amount) - Number(data.paidAmount))}.</p>}
              {data.qrUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.transferQr} src={data.qrUrl} alt="Mã QR chuyển khoản thử nghiệm" width={260} height={260} />
              )}
              <dl className="kv">
                <div><dt>Ngân hàng</dt><dd>{data.bankCode}</dd></div>
                <div><dt>Chủ tài khoản</dt><dd>{data.accountName}</dd></div>
                <div><dt>Số tài khoản</dt><dd className={styles.transferValue}><strong>{data.accountNumber}</strong><Button variant="secondary" onClick={() => copy(data.accountNumber!, "số tài khoản")}>Sao chép</Button></dd></div>
                <div><dt>Số tiền cần chuyển</dt><dd><strong>{formatMoney(Number(data.amount) - Number(data.paidAmount))}</strong></dd></div>
                <div><dt>Nội dung chuyển khoản</dt><dd className={styles.transferValue}><strong>{data.txnRef}</strong><Button variant="secondary" onClick={() => copy(data.txnRef!, "nội dung chuyển khoản")}>Sao chép</Button></dd></div>
              </dl>
              {copied && <p role="status">{copied}</p>}
            </div>
          ) : data.available && data.status === null ? (
            <>
              <p>Bạn có thể tự tạo hướng dẫn chuyển khoản cho đơn này.</p>
              <div className="notice notice-warning">Chỉ dùng với tài khoản SePay Test mode; giao dịch mô phỏng không phát sinh tiền thật.</div>
              <Button disabled={busy} onClick={create}>{busy ? "Đang tạo…" : "Thanh toán chuyển khoản"}</Button>
            </>
          ) : (
            <p className="muted">
              {data.reason === "UNCONFIGURED" ? "Shop chưa cấu hình chuyển khoản tự phục vụ." :
                data.reason === "OTHER_PAYMENT_SELECTED" ? "Đơn đã chọn hình thức thanh toán khác. Vui lòng liên hệ shop." :
                "Đơn này hiện không nhận chuyển khoản."}
            </p>
          )}
        </>
      )}
      {submitError && <div className="notice notice-danger" role="alert">{submitError}</div>}
    </Card>
  );
}
