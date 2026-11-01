"use client";

/**
 * Hộp thoại sửa tay địa chỉ giao.
 *
 * Lối thoát cho cảnh báo "địa chỉ chưa chuẩn hoá". Bộ tách tự động
 * chỉ đúng được phần lớn: khách gõ tên thành phố thay cho tỉnh, quên
 * phường, hoặc viết tên tỉnh đã sáp nhập. Không có màn này thì shop
 * đọc cảnh báo xong không làm gì được, mà đơn cũng không đẩy sang
 * hãng được.
 *
 * ── BA QUYẾT ĐỊNH ──
 *
 * 1. Tỉnh là DANH SÁCH CHỌN, không phải ô gõ. Hãng tra theo danh mục
 *    của họ, gõ tay là sai chính tả rồi hỏng ở bước tạo vận đơn —
 *    muộn hơn và khó hiểu hơn. Danh sách lấy từ backend nên không
 *    bao giờ lệch với bộ kiểm tra phía sau.
 *
 * 2. Quận/huyện để TRỐNG là mặc định. Sau 01/07/2025 Việt Nam bỏ cấp
 *    huyện; để trống là đúng với giấy tờ hiện hành. Vẫn cho điền vì
 *    danh mục của mọi hãng còn ba cấp và bưu tá quen địa chỉ cũ hơn.
 *
 * 3. Giữ nguyên chuỗi khách đã gõ, hiện ngay trên form. Người sửa
 *    cần nhìn thấy bản gốc để đối chiếu, chứ không phải nhớ lại.
 */

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ordersApi, shippingApi, type OrderDetail } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import styles from "./edit-address-dialog.module.css";

/**
 * CHỈ mount khi đang mở (xem chỗ gọi).
 *
 * Nhờ vậy state khởi tạo thẳng từ props, không cần effect nào để
 * dọn form giữa hai lần mở — mà effect đó chính là chỗ dễ để sót
 * dữ liệu cũ rồi ghi đè bằng thông tin lỗi thời.
 */
export function EditAddressDialog({
  order,
  onClose,
  onSaved,
}: {
  order: OrderDetail;
  onClose: () => void;
  onSaved: (donMoi: OrderDetail) => void;
}) {
  const { data: dsTinh } = useApi(() => shippingApi.provinces(), []);

  const [ten, setTen] = useState(order.recipientName ?? "");
  const [sdt, setSdt] = useState(order.recipientPhone ?? "");
  // Ba ô địa chỉ để TRỐNG, không điền sẵn bản tách hỏng. Điền sẵn
  // một kết quả sai là mời người dùng bấm Lưu mà không đọc.
  const [tinh, setTinh] = useState("");
  const [huyen, setHuyen] = useState("");
  const [phuong, setPhuong] = useState("");
  const [duong, setDuong] = useState("");
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState("");

  // Danh mục của HÃNG, nạp dần theo lựa chọn. Rỗng = hãng chưa khai
  // khoá hoặc không tra được; lúc đó các ô lùi về gõ tay.
  const { data: dsHuyen } = useApi(
    () => (tinh ? shippingApi.districts(tinh) : Promise.resolve([])),
    [tinh],
  );
  const { data: dsPhuong } = useApi(
    () =>
      tinh && huyen ? shippingApi.wards(tinh, huyen) : Promise.resolve([]),
    [tinh, huyen],
  );

  const chonDuocHuyen = (dsHuyen ?? []).length > 0;
  const chonDuocPhuong = (dsPhuong ?? []).length > 0;

  const chan =
    busy ||
    ten.trim().length < 2 ||
    sdt.trim() === "" ||
    tinh === "" ||
    phuong.trim() === "" ||
    duong.trim().length < 3;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (chan) return;

    setBusy(true);
    setLoi("");
    try {
      const donMoi = await ordersApi.setAddress(order.id, {
        recipientName: ten.trim(),
        recipientPhone: sdt.trim(),
        provinceName: tinh,
        districtName: huyen.trim() || null,
        wardName: phuong.trim(),
        streetLine: duong.trim(),
      });
      onSaved(donMoi);
      onClose();
    } catch (err) {
      // Nguyên văn lời backend trả về. Khi tỉnh sai, câu đó kèm luôn
      // gợi ý tên đúng ("Có phải bạn muốn chọn Khánh Hòa?") — rút
      // gọn lại là mất đúng phần giúp được shop.
      setLoi(err instanceof Error ? err.message : "Không lưu được địa chỉ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Sửa địa chỉ giao — ${order.orderCode}`}
      footer={
        <div className="dialog-footer">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Thoát
          </Button>
          <Button onClick={submit} disabled={chan}>
            {busy ? "Đang lưu…" : "Lưu địa chỉ"}
          </Button>
        </div>
      }
    >
      <form onSubmit={submit}>
        {order.shippingAddress && (
          <div className={styles.goc}>
            <span className={styles.gocNhan}>Khách đã gõ</span>
            <p className={styles.gocNoiDung}>{order.shippingAddress}</p>
          </div>
        )}

        <div className="field">
          <label htmlFor="addr-name">Người nhận</label>
          <input
            id="addr-name"
            value={ten}
            onChange={(e) => setTen(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="addr-phone">Số điện thoại</label>
          <input
            id="addr-phone"
            inputMode="tel"
            value={sdt}
            onChange={(e) => setSdt(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="addr-province">Tỉnh / Thành phố</label>
          <select
            id="addr-province"
            value={tinh}
            onChange={(e) => setTinh(e.target.value)}
          >
            <option value="">— Chọn tỉnh/thành —</option>
            {(dsTinh ?? []).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <p className="muted">
            Danh mục 34 đơn vị sau sáp nhập 01/07/2025. Tên thành phố như
            “Nha Trang”, “Biên Hòa” không còn trong danh sách — chọn tỉnh
            đang quản lý.
          </p>
        </div>

        <div className="field">
          <label htmlFor="addr-district">Quận / Huyện</label>
          {chonDuocHuyen ? (
            <select
              id="addr-district"
              value={huyen}
              onChange={(e) => {
                setHuyen(e.target.value);
                // Đổi huyện thì phường cũ không còn thuộc về đâu nữa.
                setPhuong("");
              }}
            >
              <option value="">— Chọn quận/huyện —</option>
              {(dsHuyen ?? []).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="addr-district"
              value={huyen}
              onChange={(e) => setHuyen(e.target.value)}
              placeholder={tinh ? "Nhập tay" : "Chọn tỉnh/thành trước"}
              disabled={!tinh}
            />
          )}
          <p className="muted">
            Giấy tờ sau 01/07/2025 đã bỏ cấp huyện, nhưng danh mục của mọi
            hãng vận chuyển vẫn còn — thiếu nó là hãng không tra ra phường.
          </p>
        </div>

        <div className="field">
          <label htmlFor="addr-ward">Phường / Xã</label>
          {chonDuocPhuong ? (
            <select
              id="addr-ward"
              value={phuong}
              onChange={(e) => setPhuong(e.target.value)}
            >
              <option value="">— Chọn phường/xã —</option>
              {(dsPhuong ?? []).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="addr-ward"
              value={phuong}
              onChange={(e) => setPhuong(e.target.value)}
              placeholder={
                chonDuocHuyen && !huyen ? "Chọn quận/huyện trước" : "Phường Lộc Thọ"
              }
            />
          )}
        </div>

        <div className="field">
          <label htmlFor="addr-street">Số nhà, tên đường</label>
          <input
            id="addr-street"
            value={duong}
            onChange={(e) => setDuong(e.target.value)}
            placeholder="88 Trần Phú"
          />
        </div>

        {loi && (
          <p className={styles.loi} role="alert">
            {loi}
          </p>
        )}
      </form>
    </Dialog>
  );
}
