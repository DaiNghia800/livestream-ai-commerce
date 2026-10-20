"use client";

/**
 * Hộp thoại đẩy đơn sang hãng vận chuyển.
 *
 * Hai điều cố ý KHÔNG làm ở đây:
 *
 *   1. Không hiện trước mã vận đơn hay mã vạch. Mã do hãng sinh, chỉ
 *      có SAU khi gọi API thành công — in trước rồi dán lên kiện là
 *      hãng không quét được.
 *   2. Không hiện tên bưu tá. Hãng chưa phân công ai ở thời điểm tạo
 *      đơn; sớm nhất là lúc kiện đang trên đường giao.
 *
 * Hãng chưa khai khoá thì để mờ kèm lý do, chứ không ẩn đi: shop cần
 * biết là có lựa chọn đó và thiếu gì để bật nó lên.
 */

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { shippingApi, type CarrierOption, type ShipmentDetail } from "@/lib/api";
import { useApi } from "@/lib/use-api";

/** Cân nặng mặc định khi shop chưa cân: 500 g là một kiện áo thường. */
const CAN_MAC_DINH = 500;

export function CreateShipmentDialog({
  orderId,
  orderCode,
  open,
  onClose,
  onCreated,
}: {
  orderId: string;
  orderCode: string;
  open: boolean;
  onClose: () => void;
  onCreated: (vanDon: ShipmentDetail) => void;
}) {
  const { data: hangData } = useApi(() => shippingApi.carriers(), []);
  const hangs: CarrierOption[] = hangData ?? [];

  const [hang, setHang] = useState("");
  const [can, setCan] = useState(String(CAN_MAC_DINH));
  const [dai, setDai] = useState("");
  const [rong, setRong] = useState("");
  const [cao, setCao] = useState("");
  const [khaiGia, setKhaiGia] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState("");

  const canSo = Number(can);
  const canHopLe = Number.isInteger(canSo) && canSo > 0 && canSo <= 50000;
  const chan = !hang || !canHopLe || busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (chan) return;

    setBusy(true);
    setLoi("");
    try {
      const vanDon = await shippingApi.create({
        orderId,
        carrier: hang,
        weightGram: canSo,
        lengthCm: dai ? Number(dai) : null,
        widthCm: rong ? Number(rong) : null,
        heightCm: cao ? Number(cao) : null,
        insuranceValue: khaiGia || null,
        note: ghiChu.trim() || null,
      });
      onCreated(vanDon);
      onClose();
    } catch (err) {
      // Nguyên văn lý do hãng từ chối. Đây là thứ shop mang đi hỏi
      // tổng đài, rút gọn lại là mất đúng phần cần.
      setLoi(err instanceof Error ? err.message : "Không tạo được vận đơn");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Tạo vận đơn cho ${orderCode}`}
      footer={
        <div className="dialog-footer">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Thoát
          </Button>
          <Button onClick={submit} disabled={chan}>
            {busy ? "Đang gửi hãng…" : "Tạo vận đơn"}
          </Button>
        </div>
      }
    >
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="ship-carrier">Đơn vị vận chuyển</label>
          <select
            id="ship-carrier"
            value={hang}
            onChange={(e) => setHang(e.target.value)}
          >
            <option value="">— Chọn hãng —</option>
            {hangs.map((h) => (
              <option key={h.name} value={h.name} disabled={!h.ready}>
                {h.label}
                {h.ready ? "" : " (chưa khai khoá)"}
              </option>
            ))}
          </select>
          <p className="muted">
            Hãng để mờ là chưa điền khoá trong cấu hình. Chọn{" "}
            <strong>Shop tự giao</strong> nếu tự ship, trạng thái sẽ do shop bấm
            tay.
          </p>
        </div>

        <div className="field">
          <label htmlFor="ship-weight">Cân nặng (gram)</label>
          <input
            id="ship-weight"
            type="number"
            min={1}
            max={50000}
            value={can}
            onChange={(e) => setCan(e.target.value)}
          />
          {!canHopLe && can !== "" && (
            <span className="field-error">
              Cân nặng phải từ 1 đến 50.000 g. Nặng hơn thì phải tách kiện.
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="ship-l">Kích thước (cm) — không bắt buộc</label>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <input
              id="ship-l"
              type="number"
              min={1}
              max={200}
              placeholder="Dài"
              value={dai}
              onChange={(e) => setDai(e.target.value)}
            />
            <input
              type="number"
              min={1}
              max={200}
              placeholder="Rộng"
              value={rong}
              onChange={(e) => setRong(e.target.value)}
              aria-label="Chiều rộng"
            />
            <input
              type="number"
              min={1}
              max={200}
              placeholder="Cao"
              value={cao}
              onChange={(e) => setCao(e.target.value)}
              aria-label="Chiều cao"
            />
          </div>
          <p className="muted">
            Bỏ trống thì hãng tính cước theo cân nặng. Hàng cồng kềnh mà không
            khai thì hãng cân lại ở kho và cước đội lên.
          </p>
        </div>

        <div className="field">
          <label htmlFor="ship-insurance">Khai giá hàng hoá (đồng)</label>
          <input
            id="ship-insurance"
            type="number"
            min={0}
            max={5000000}
            placeholder="0"
            value={khaiGia}
            onChange={(e) => setKhaiGia(e.target.value)}
          />
          <p className="muted">
            Hãng bồi thường theo số này khi vỡ hoặc mất. Tối đa 5.000.000 đ.
          </p>
        </div>

        <div className="field">
          <label htmlFor="ship-note">Ghi chú cho bưu tá</label>
          <input
            id="ship-note"
            maxLength={500}
            placeholder="Giao giờ hành chính, gọi trước khi giao…"
            value={ghiChu}
            onChange={(e) => setGhiChu(e.target.value)}
          />
        </div>

        {/* Nói trước để shop không đi tìm nút in ngay sau khi bấm tạo. */}
        <div className="notice notice-info">
          <p>
            Mã vận đơn do hãng cấp sau khi nhận đơn, nên phiếu gửi hàng chỉ in
            được ở màn chi tiết sau khi tạo xong.
          </p>
        </div>

        {loi && <span className="field-error">{loi}</span>}
      </form>
    </Dialog>
  );
}
