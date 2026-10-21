"use client";

/**
 * Cổng thanh toán trực tuyến cho khách (theo mẫu 122d).
 *
 * Trước đây chọn "chuyển khoản / thẻ" ở bước xác nhận là đi vào ngõ
 * cụt: trang chỉ hiện khối chuyển khoản SePay, mà khối đó đòi năm
 * biến môi trường chưa ai điền, nên khách chỉ thấy một câu "shop
 * chưa cấu hình". Bốn cổng thật đã nằm sẵn trong mã nguồn — thiếu
 * đúng một lối để khách đi tới.
 *
 * ── BÀY CẢ CỔNG CHƯA KHAI KHOÁ ──
 *
 * Cổng thiếu khoá vẫn hiện, nhưng để mờ kèm đúng tên biến còn
 * thiếu. Ẩn đi thì shop không biết phải điền gì để bật, còn khách
 * không hiểu vì sao chỉ có một lựa chọn. Đây cũng là cách màn tạo
 * vận đơn đang làm với các hãng.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { paymentsApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import styles from "./customer-order-confirmation.module.css";

/**
 * Nhãn thương hiệu của cổng.
 *
 * Chữ đặt trên nền màu của hãng, KHÔNG phải tệp logo chính thức.
 * Muốn dùng logo thật thì phải tải tệp hãng phát hành về kho ảnh
 * của dự án và theo đúng quy định dùng nhãn hiệu của họ — vẽ lại
 * cho giống là chuyện khác hẳn.
 */
const NHAN_HIEU: Record<string, { chu: string; lop: string }> = {
  vnpay: { chu: "VNPAY", lop: "hieuVnpay" },
  momo: { chu: "MoMo", lop: "hieuMomo" },
  zalopay: { chu: "ZaloPay", lop: "hieuZalopay" },
  mock: { chu: "THỬ", lop: "hieuMock" },
};

export function CustomerOnlinePayment({
  token,
  amount,
}: {
  token: string;
  amount: string;
}) {
  const { data, loading, error } = useApi(
    () => paymentsApi.customerGateways(token),
    [token],
  );
  const [chon, setChon] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState("");

  if (loading || error || !data) return null;

  const dungDuoc = data.filter((g) => g.ready);
  if (dungDuoc.length === 0 && data.length === 0) return null;

  const dangChon = chon ?? dungDuoc[0]?.name ?? null;

  async function sang() {
    if (!dangChon || busy) return;
    setBusy(true);
    setLoi("");
    try {
      const { payUrl } = await paymentsApi.customerCheckout(token, dangChon);
      // Rời khỏi trang: phiên thanh toán nằm ở phía cổng, không phải
      // ở đây. Dùng replace để nút Back không quay về một màn đã
      // mất ý nghĩa rồi bấm tạo thêm một phiên nữa.
      window.location.replace(payUrl);
    } catch (err) {
      setLoi(err instanceof Error ? err.message : "Không mở được cổng thanh toán.");
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2>Thanh toán trực tuyến</h2>
      <p className="muted">
        Chọn cổng rồi bấm tiếp tục. Giao dịch diễn ra trên trang của cổng, hệ
        thống chỉ nhận kết quả báo về.
      </p>

      <div className={styles.congBox}>
        <div className={styles.phuongThuc}>
          {data.map((g) => {
            const hieu = NHAN_HIEU[g.name];
            return (
              <label
                key={g.name}
                className={[
                  styles.cachTra,
                  dangChon === g.name ? styles.cachTraChon : "",
                  g.ready ? "" : styles.cachTraMo,
                ].filter(Boolean).join(" ")}
              >
                <input
                  type="radio"
                  name="cong-thanh-toan"
                  value={g.name}
                  checked={dangChon === g.name}
                  disabled={!g.ready}
                  onChange={() => setChon(g.name)}
                />
                {hieu && (
                  <span
                    className={`${styles.hieu} ${styles[hieu.lop]}`}
                    aria-hidden="true"
                  >
                    {hieu.chu}
                  </span>
                )}
                <span>
                  <strong>{g.label}</strong>
                  {g.ready ? null : (
                    <span className="muted">
                      Shop chưa khai khoá. Thiếu: {g.missing.join(", ")}.
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>

        {loi && <div className="notice notice-danger" role="alert">{loi}</div>}

        {dungDuoc.length === 0 ? (
          <p className="muted">
            Chưa cổng nào được khai khoá. Hãy chọn thanh toán khi nhận hàng,
            hoặc liên hệ shop.
          </p>
        ) : (
          <Button onClick={sang} disabled={busy || !dangChon}>
            {busy ? "Đang mở cổng…" : `Tiếp tục thanh toán ${formatMoney(Number(amount))}`}
          </Button>
        )}
      </div>
    </Card>
  );
}
