"use client";

/**
 * Trang khách xác nhận đơn chốt trong phiên live.
 *
 * Dựng theo mẫu 120d. Ba thứ mẫu đòi mà hệ thống CHƯA có dữ liệu —
 * giá gốc gạch ngang, quà tặng kèm, voucher freeship — được bỏ hẳn
 * chứ không vẽ số giả: đây là màn khách thật đọc trước khi trả tiền.
 *
 * ── VÌ SAO BỐ CỤC NÀY ──
 *
 * Cột trái kể "bạn đã mua gì", cột phải hỏi "bạn trả thế nào". Khung
 * "giữ chỗ" nằm trên cùng cột phải, ngay cạnh nút xác nhận: nó nói rõ
 * hàng chỉ được trừ kho lúc bấm xác nhận — bấm sớm vẫn có lợi, nhưng
 * không ai bị đồng hồ dí. Đơn nháp không giữ tồn và không hết hạn.
 */

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import {
  addressBookApi,
  layTokenKhach,
  ordersApi,
  paymentsApi,
  shippingApi,
  type UserAddress,
} from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import styles from "./customer-order-confirmation.module.css";
import { AddressFormDialog, ChonDiaChiDialog } from "./address-book-dialog";
import { AddressPicker } from "./address-picker";
import { ChonCachTra, DiaChiNhanHang, loiXacNhan, type PhuongThuc } from "./checkout-parts";
import { CustomerBankTransfer } from "./customer-bank-transfer";
import { CustomerOnlinePayment } from "./customer-online-payment";

export function CustomerOrderConfirmation({ token }: { token: string }) {
  const { data, error, loading, reload } = useApi(
    () => ordersApi.confirmPreview(token),
    [token],
  );
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [provinceName, setProvinceName] = useState("");
  const [wardCode, setWardCode] = useState("");
  const [streetLine, setStreetLine] = useState("");
  const [picker, setPicker] = useState<"province" | "ward" | null>(null);
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<PhuongThuc>("COD");
  // Sổ địa chỉ CHỈ khi đã đăng nhập. Khách live không bắt buộc có tài
  // khoản — thiết kế token của trang này dựa trên điều đó — nên không
  // đăng nhập thì form tay vẫn nguyên như cũ, không chặn ai.
  const daDangNhap = Boolean(layTokenKhach());
  const soDiaChi = useApi(
    () => (daDangNhap ? addressBookApi.list() : Promise.resolve([] as UserAddress[])),
    [daDangNhap],
  );
  // Địa chỉ khách chọn trong sổ; null = lấy mặc định (hay cái đầu tiên).
  const [chonDiaChiId, setChonDiaChiId] = useState<string | null>(null);
  const [hopThoaiDiaChi, setHopThoaiDiaChi] = useState<"chon" | "them" | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  // Tiền về qua webhook của cổng, KHÔNG qua trình duyệt khách. Không
  // hỏi lại thì màn hình đứng ở "chờ thanh toán" dù đã thu xong, và
  // khách rất dễ trả thêm lần nữa.
  const { daThu, phuongThuc } = useThanhToanXong(token, data?.status);
  // Tiền về thì đơn đổi trạng thái phía server (giữ hàng → CONFIRMED, hay
  // hết hàng → CANCELLED): đọc lại để màn hình nói đúng chuyện đã xảy ra.
  useEffect(() => {
    if (daThu) reload();
  }, [daThu, reload]);
  // Chọn COD là xong việc tại đây: không có cổng nào để đi tiếp, và
  // không được lẫn với khối chuyển khoản.
  const laCod = phuongThuc === "COD";
  const provinces = useApi(() => shippingApi.provinces(), []);
  const wards = useApi(
    () => provinceName ? shippingApi.currentWards(provinceName) : Promise.resolve([]),
    [provinceName],
  );

  if (loading) return <LoadingState />;
  if (error) {
    if (error.status === 404) {
      return (
        <EmptyState
          title="Không tìm thấy liên kết xác nhận"
          description="Liên kết có thể đã sai. Hãy nhờ shop gửi lại đúng liên kết của đơn."
        />
      );
    }
    // Đơn đã nối với một tài khoản: chỉ chủ đơn mới mở được.
    if (error.status === 401 || error.status === 403) {
      return (
        <div className="state" role="alert">
          <h2>{error.status === 401 ? "Đăng nhập để xem đơn này" : "Đơn này thuộc tài khoản khác"}</h2>
          <p>
            {error.status === 401
              ? "Đơn được đặt bằng một tài khoản. Hãy đăng nhập đúng tài khoản đó rồi mở lại liên kết."
              : "Bạn đang đăng nhập bằng tài khoản không phải người đặt đơn. Đăng xuất rồi đăng nhập đúng tài khoản để tiếp tục."}
          </p>
          {error.status === 401 && <Link className="button button-primary" href="/login">Đăng nhập</Link>}
        </div>
      );
    }
    return <ErrorState action={<Button onClick={reload}>Thử lại</Button>} />;
  }
  if (!data) return null;

  const canConfirm = data.status === "DRAFT" || data.status === "PENDING_CONFIRMATION";
  // Dùng sổ khi đã đăng nhập và sổ đọc được. Token hết hạn (401) thì
  // lùi về form tay — không chặn khách chỉ vì phiên đăng nhập cũ.
  const dungSo = daDangNhap && !soDiaChi.error;
  const dsDiaChi = dungSo ? soDiaChi.data ?? null : null;
  const diaChiChon = dsDiaChi
    ? dsDiaChi.find((d) => d.id === chonDiaChiId) ??
      dsDiaChi.find((d) => d.isDefault) ??
      dsDiaChi[0] ??
      null
    : null;
  const selectedWard = wards.refreshing ? undefined : wards.data?.find((ward) => ward.code === wardCode);
  const addressReady = dungSo
    ? Boolean(diaChiChon)
    : Boolean(provinceName && selectedWard && streetLine.trim().length >= 3);
  const soMon = data.items.reduce((tong, item) => tong + item.quantity, 0);
  // Bình luận gốc của dòng đầu tiên là đủ: khách nhận ra đơn của mình
  // ngay khi thấy chính câu họ đã gõ.
  const cuPhap = data.items.find((item) => item.sourceComment)?.sourceComment;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canConfirm || busy || !addressReady) return;
    setBusy(true);
    setSubmitError("");
    try {
      // Đã đăng nhập thì gửi đúng địa chỉ đã chọn trong sổ; khách vãng
      // lai thì gửi những gì họ gõ.
      const diaChi = dungSo && diaChiChon
        ? {
            recipientName: diaChiChon.recipientName,
            recipientPhone: diaChiChon.recipientPhone,
            provinceName: diaChiChon.provinceName,
            wardCode: diaChiChon.wardCode,
            streetLine: diaChiChon.streetLine,
          }
        : {
            recipientName: recipientName.trim(),
            recipientPhone: recipientPhone.trim(),
            provinceName,
            wardCode,
            streetLine: streetLine.trim(),
          };
      await ordersApi.confirm(token, {
        ...diaChi,
        note: note.trim(),
        paymentMethod: payment,
      });
      reload();
    } catch (cause) {
      setSubmitError(loiXacNhan(cause, data?.items ?? []));
      // Tải lại để trang phản ánh đúng trạng thái thật — form giữ
      // nguyên những gì khách đã gõ.
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <BaBuoc dangO={canConfirm ? 1 : 2} />

      <div className={styles.heading}>
        <p className="eyebrow">ĐƠN HÀNG CỦA BẠN</p>
        <h1>Xác nhận đơn {data.orderCode}</h1>
        <p className="muted">Kiểm tra sản phẩm và địa chỉ trước khi chốt đơn.</p>
      </div>

      {data.status === "CANCELLED" && data.cancelReason === "OUT_OF_STOCK_AT_PAYMENT" ? (
        <div className="notice notice-danger" role="alert">
          <strong>Rất tiếc, hết hàng đúng lúc tiền về.</strong> Đơn đã bị huỷ
          và shop sẽ hoàn lại số tiền bạn đã chuyển.
        </div>
      ) : daThu && data.status !== "AWAITING_PAYMENT" ? (
        <div className="notice notice-info" role="status">
          <strong>Đã nhận được thanh toán, hàng đã được giữ cho bạn.</strong> Shop
          sẽ đóng gói và bàn giao cho đơn vị vận chuyển.
        </div>
      ) : null}
      {data.status === "AWAITING_PAYMENT" && !laCod && (
        <div className="notice notice-warning" role="status">
          <strong>Đơn đang chờ thanh toán.</strong> Hàng chưa được giữ; ngay
          khi tiền về, hệ thống giữ hàng và chuyển đơn sang đã xác nhận.
          Chọn cổng thanh toán bên dưới.
        </div>
      )}
      {laCod && !daThu && (
        <div className="notice notice-info" role="status">
          <strong>Đã chốt đơn.</strong> Bạn thanh toán bằng tiền mặt khi
          nhận hàng. Shop sẽ đóng gói và bàn giao cho đơn vị vận chuyển.
        </div>
      )}
      {!canConfirm && !daThu && !laCod && data.status !== "AWAITING_PAYMENT" && !(data.status === "CANCELLED" && data.cancelReason === "OUT_OF_STOCK_AT_PAYMENT") && (
        <div className={data.status === "CONFIRMED" || data.status === "PROCESSING" || data.status === "SHIPPING" || data.status === "COMPLETED" ? "notice notice-info" : "notice notice-warning"} role="status">
          {data.status === "EXPIRED" || data.status === "CANCELLED" || data.status === "RETURNED"
            ? "Đơn này đã đóng. Hãy liên hệ shop nếu bạn vẫn muốn mua."
            : "Đơn đã được xác nhận. Xem thông tin thanh toán bên dưới."}
        </div>
      )}
      {data.status === "CONFIRMED" && !data.addressNormalized && (
        <div className="notice notice-warning" role="status">
          Địa chỉ cần shop kiểm tra thêm trước khi gửi hàng. Vui lòng liên hệ shop để xác nhận phường/xã và tỉnh/thành phố.
        </div>
      )}

      <div className={styles.columns}>
        <div className={styles.cot}>
          {(data.livestreamTitle || cuPhap) && (
            <Card>
              <div className={styles.aiDau}>
                <span className={styles.aiNhan}>AI chốt đơn tự động</span>
                {data.livestreamTitle && (
                  <span className={styles.aiPhien}>
                    Phiên “{data.livestreamTitle}”
                  </span>
                )}
              </div>
              {cuPhap && (
                <p className={styles.aiCuPhap}>
                  <span>Bình luận của bạn:</span>
                  <code>{cuPhap}</code>
                </p>
              )}
            </Card>
          )}

          <Card>
            <h2>Sản phẩm đã chốt</h2>
            <ul className={styles.items}>
              {data.items.map((item) => (
                <li key={item.id}>
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className={styles.anh}
                      src={item.imageUrl}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <span className={styles.anhTrong} aria-hidden="true" />
                  )}
                  <div>
                    <strong>{item.productName || item.skuCode || `Mã ${item.skuId}`}</strong>
                    <span className="muted">
                      {item.variantName ? `${item.variantName} · ` : ""}
                      {item.skuCode}
                    </span>
                    <span className="muted">
                      {item.quantity} × {formatMoney(Number(item.unitPrice))}
                    </span>
                    {item.isPartial && <span className={styles.partial}>Bạn chọn {item.requestedQty}, lúc chốt shop chỉ còn {item.quantity}.</span>}
                  </div>
                  <strong>{formatMoney(item.quantity * Number(item.unitPrice))}</strong>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2>Thông tin nhận hàng</h2>
            {canConfirm ? (
              <form id="form-xac-nhan" className={styles.form} onSubmit={submit}>
                {dungSo ? (
                  // Đã đăng nhập: một dòng địa chỉ như các sàn, "Thay đổi"
                  // mở popup chọn trong sổ. Không có ô nào để gõ lại.
                  <DiaChiNhanHang
                    dangTai={!dsDiaChi}
                    diaChi={diaChiChon}
                    onDoi={() => setHopThoaiDiaChi("chon")}
                    onThem={() => setHopThoaiDiaChi("them")}
                  />
                ) : (
                  <>
                    <Input label="Họ và tên người nhận" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={150} required autoComplete="name" />
                    <Input label="Số điện thoại" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} maxLength={20} minLength={9} required autoComplete="tel" inputMode="tel" />
                    <div className="field">
                      <label htmlFor="customer-province">Tỉnh / Thành phố</label>
                      <button id="customer-province" className={styles.addressChoice} type="button" onClick={() => setPicker("province")} aria-label="Chọn tỉnh/thành">
                        {provinceName || "Chọn tỉnh/thành"}
                      </button>
                    </div>
                    <div className="field">
                      <label htmlFor="customer-ward">Phường / Xã / Đặc khu</label>
                      <button id="customer-ward" className={styles.addressChoice} type="button" onClick={() => setPicker("ward")} disabled={!provinceName} aria-label="Chọn phường/xã">
                        {selectedWard?.name ?? (provinceName ? "Chọn phường/xã" : "Chọn tỉnh/thành trước")}
                      </button>
                    </div>
                    <Input label="Số nhà, tên đường" value={streetLine} onChange={(e) => setStreetLine(e.target.value)} minLength={3} maxLength={200} required autoComplete="off" placeholder="12 Nguyễn Huệ" />
                  </>
                )}
                <div className="field">
                  <label htmlFor="customer-note">Ghi chú giao hàng cho shipper (không bắt buộc)</label>
                  <textarea id="customer-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Giao giờ hành chính, gọi trước khi giao." />
                </div>
              </form>
            ) : data.recipientName ? (
              <dl className="kv">
                <div><dt>Người nhận</dt><dd>{data.recipientName}</dd></div>
                <div><dt>Số điện thoại</dt><dd>{data.recipientPhone}</dd></div>
                <div><dt>Địa chỉ</dt><dd>{data.shippingAddress}</dd></div>
              </dl>
            ) : <p className="muted">Chưa có thông tin nhận hàng.</p>}
          </Card>

          {/* Khối QR nằm ở cột trái cho cân: cột phải sau khi xác
              nhận đã dài gấp đôi, còn bên này trống một mảng lớn. */}
          {!laCod && ["AWAITING_PAYMENT", "CONFIRMED", "PROCESSING", "SHIPPING", "COMPLETED"].includes(data.status) && (
            <CustomerBankTransfer token={token} />
          )}
        </div>

        <div className={styles.cot}>
          {canConfirm && (
            <Card>
              <GiuCho soMon={soMon} />
            </Card>
          )}

          {canConfirm && (
            <Card>
              <h2>Phương thức thanh toán</h2>
              <div className={styles.phuongThuc}>
                <ChonCachTra
                  value="COD"
                  chon={payment}
                  onChon={setPayment}
                  ten="COD – Thanh toán khi nhận hàng"
                  mo="Được kiểm tra hàng trước khi thanh toán bằng tiền mặt."
                />
                <ChonCachTra
                  value="ONLINE"
                  chon={payment}
                  onChon={setPayment}
                  ten="Chuyển khoản / ví điện tử"
                  mo="Quét mã QR ngân hàng ngay sau khi xác nhận đơn."
                />
              </div>
            </Card>
          )}

          <Card>
            <h2>Chi tiết thanh toán</h2>
            <div className={styles.tomTat}>
              <div>
                <span>Tạm tính ({soMon} sản phẩm)</span>
                <span>{formatMoney(Number(data.totalAmount))}</span>
              </div>
              {/* Phí vận chuyển chưa tính được ở bước này: hãng báo giá
                  theo địa chỉ, mà khách còn đang gõ. Nói thẳng thay vì
                  hiện một con số rồi đổi sau. */}
              <div className="muted">
                <span>Phí vận chuyển</span>
                <span>shop báo sau khi chốt địa chỉ</span>
              </div>
            </div>
            <div className={styles.total}>
              <span>Tổng tiền hàng</span>
              <strong>{formatMoney(Number(data.totalAmount))}</strong>
            </div>

            {submitError && <div className="notice notice-danger" role="alert">{submitError}</div>}

            {canConfirm && (
              <>
                <Button type="submit" form="form-xac-nhan" disabled={busy || !addressReady}>
                  {busy ? "Đang xác nhận…" : "Xác nhận đơn hàng"}
                </Button>
                <p className={styles.camKet}>
                  Bằng việc xác nhận, bạn đồng ý với điều khoản mua hàng
                  livestream của shop.
                </p>
              </>
            )}
          </Card>

          {/* Đặt TRONG cột phải, không thả rơi xuống đáy trang: cột
              phải là nơi trả lời "bạn trả thế nào", và sau khi xác
              nhận thì nó trống hẳn nếu hai thẻ này nằm chỗ khác. */}
          {/* Thu xong thì GIẤU hẳn. Để nguyên là mời khách trả lần
              hai cho một đơn đã thanh toán — lỗi tiền bạc, không
              phải lỗi hiển thị. */}
          {!daThu && !laCod && ["AWAITING_PAYMENT", "CONFIRMED", "PROCESSING"].includes(data.status) && (
            <CustomerOnlinePayment token={token} amount={data.totalAmount} />
          )}
        </div>
      </div>

      {hopThoaiDiaChi === "chon" && dsDiaChi && (
        <ChonDiaChiDialog
          items={dsDiaChi}
          chonId={diaChiChon?.id ?? null}
          onChon={setChonDiaChiId}
          onClose={() => setHopThoaiDiaChi(null)}
          onDoi={() => soDiaChi.reload()}
        />
      )}
      {hopThoaiDiaChi === "them" && (
        <AddressFormDialog
          banDau={null}
          laDauTien={(dsDiaChi?.length ?? 0) === 0}
          onClose={() => setHopThoaiDiaChi(null)}
          onSaved={(d) => {
            setChonDiaChiId(d.id);
            setHopThoaiDiaChi(null);
            soDiaChi.reload();
          }}
        />
      )}
      {picker === "province" && (
        <AddressPicker
          title="Chọn tỉnh/thành"
          items={(provinces.data ?? []).map((name) => ({ code: name, name }))}
          loading={provinces.loading || provinces.refreshing}
          error={Boolean(provinces.error)}
          onClose={() => setPicker(null)}
          onSelect={(code) => {
            if (code !== provinceName) {
              setProvinceName(code);
              setWardCode("");
            }
            setPicker(null);
          }}
        />
      )}
      {picker === "ward" && (
        <AddressPicker
          title={`Chọn phường/xã · ${provinceName}`}
          items={wards.refreshing ? [] : wards.data ?? []}
          loading={wards.loading || wards.refreshing}
          error={Boolean(wards.error)}
          onClose={() => setPicker(null)}
          onSelect={(code) => { setWardCode(code); setPicker(null); }}
        />
      )}
    </div>
  );
}

/**
 * Ba bước của một đơn chốt live.
 *
 * Không phải trang trí: khách tới đây từ một bình luận, chưa chắc
 * hiểu mình đang ở đâu trong quy trình và còn phải làm gì nữa.
 */
function BaBuoc({ dangO }: { dangO: number }) {
  const buoc = ["Bình luận chốt", "Xác nhận đơn", "Shop giao hàng"];
  return (
    <ol className={styles.baBuoc} aria-label="Các bước đặt hàng">
      {buoc.map((ten, i) => (
        <li
          key={ten}
          className={[
            styles.buoc,
            i < dangO ? styles.buocXong : "",
            i === dangO ? styles.buocHienTai : "",
          ].filter(Boolean).join(" ")}
          aria-current={i === dangO ? "step" : undefined}
        >
          <span className={styles.buocSo}>{i < dangO ? "✓" : i + 1}</span>
          <span>{ten}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Khung "giữ chỗ" thay cho đồng hồ đếm ngược.
 *
 * Đơn nháp không giữ tồn và không có hạn: hàng chỉ được trừ kho đúng
 * lúc bấm xác nhận, ai bấm trước được trước. Nói thẳng điều đó — kể
 * cả vế "có thể hết" — hơn là một đồng hồ dí khách, hoặc một lời hứa
 * giữ hàng mà hệ thống không giữ.
 */
function GiuCho({ soMon }: { soMon: number }) {
  return (
    <div className={styles.giuCho}>
      <span className={styles.giuChoNhan}>Đơn của bạn đang chờ xác nhận</span>
      <p className={styles.giuChoLoi}>
        Link này không hết hạn. <strong>{soMon}</strong> sản phẩm chỉ được trừ
        kho khi bạn bấm xác nhận — mã nào hết trước lúc đó, bạn sẽ được báo
        ngay tại đây.
      </p>
    </div>
  );
}

/**
 * Hỏi lại tình trạng thu tiền cho tới khi xong.
 *
 * Dừng hẳn khi đã thu đủ — để nguyên vòng lặp thì một tab bỏ quên
 * sẽ gọi máy chủ mãi mãi. Cũng không chạy khi đơn chưa xác nhận:
 * lúc đó chưa có khoản thu nào để mà hỏi.
 */
function useThanhToanXong(
  token: string,
  status?: string
): { daThu: boolean; phuongThuc: "COD" | "ONLINE" | null } {
  const [xong, setXong] = useState(false);
  const [phuongThuc, setPhuongThuc] = useState<"COD" | "ONLINE" | null>(null);

  // COD không bao giờ "PAID" qua cổng — tiền về sau khi giao. Biết là
  // COD rồi thì thôi hỏi, để một tab bỏ quên không gọi máy chủ mãi.
  const dangCho =
    !xong &&
    phuongThuc !== "COD" &&
    (status === "AWAITING_PAYMENT" || status === "CONFIRMED" || status === "PROCESSING");

  useEffect(() => {
    if (!dangCho) return;
    let huy = false;

    const hoi = async () => {
      try {
        const kq = await paymentsApi.customerPaymentStatus(token);
        if (huy) return;
        if (kq.method === "COD" || kq.method === "ONLINE") {
          setPhuongThuc(kq.method);
        }
        if (kq.status === "PAID") setXong(true);
      } catch {
        // Mạng chập một nhịp không phải lý do để bỏ cuộc; lần hỏi
        // sau vẫn chạy.
      }
    };

    // Hỏi NGAY một lần: khách vừa chốt COD mà phải chờ 5 giây mới
    // thấy "đã chốt" là 5 giây tưởng trang treo.
    void hoi();
    const id = setInterval(hoi, 5000);
    return () => {
      huy = true;
      clearInterval(id);
    };
  }, [token, dangCho]);

  return { daThu: xong, phuongThuc };
}
