"use client";

/**
 * Sổ địa chỉ nhận hàng của tài khoản — bố cục theo các sàn lớn.
 *
 * Ba hộp thoại dùng chung một bộ thẻ địa chỉ:
 *   - AddressBookDialog : "Địa chỉ của tôi" từ menu tài khoản — xem,
 *     thêm, cập nhật, xoá, đặt mặc định.
 *   - ChonDiaChiDialog  : popup CHỌN trên trang xác nhận đơn — radio
 *     từng địa chỉ, có "Cập nhật" và "+ Thêm địa chỉ mới" ngay trong đó.
 *   - AddressFormDialog : form "Địa chỉ mới / Cập nhật địa chỉ".
 *
 * Tỉnh và phường chọn từ danh mục hai cấp chính thức qua popup tìm
 * kiếm — gõ tay là sai chính tả rồi hỏng ở bước tạo vận đơn. Khi thêm
 * địa chỉ đầu tiên, họ tên và số điện thoại điền sẵn từ hồ sơ.
 */

import { useState, type FormEvent } from "react";
import { Briefcase, Home, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  addressBookApi,
  profileApi,
  shippingApi,
  type AddressLabel,
  type UserAddress,
  type UserAddressInput,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { AddressPicker } from "./address-picker";
import styles from "./address-book-dialog.module.css";

export const TEN_NHAN: Record<AddressLabel, string> = {
  HOME: "Nhà riêng",
  OFFICE: "Văn phòng",
};

/** Dòng địa chỉ đầy đủ, đúng thứ tự người Việt đọc. */
export function docDiaChi(d: UserAddress): string {
  return `${d.streetLine}, ${d.wardName}, ${d.provinceName}`;
}

/** Thẻ địa chỉ: tên | SĐT, hai dòng địa chỉ, nhãn. Dùng chung cho sổ và popup chọn. */
function TheDiaChi({ d, hanhDong }: { d: UserAddress; hanhDong?: React.ReactNode }) {
  return (
    <div className={styles.the}>
      <div className={styles.theDau}>
        <strong className={styles.ten}>{d.recipientName}</strong>
        <span className={styles.sdt}>{d.recipientPhone}</span>
        {hanhDong && <span className={styles.hanhDong}>{hanhDong}</span>}
      </div>
      <p className={styles.diaChi}>
        <span>{d.streetLine}</span>
        <span>{d.wardName}, {d.provinceName}</span>
      </p>
      <div className={styles.nhan}>
        {d.isDefault && <span className={styles.nhanMacDinh}>Mặc định</span>}
        {d.label && (
          <span className={styles.nhanLoai}>
            {d.label === "HOME" ? <Home size={12} aria-hidden="true" /> : <Briefcase size={12} aria-hidden="true" />}
            {TEN_NHAN[d.label]}
          </span>
        )}
      </div>
    </div>
  );
}

function Trong() {
  return (
    <div className={styles.trong}>
      <MapPin size={40} strokeWidth={1.25} aria-hidden="true" />
      <p>Bạn chưa có địa chỉ.</p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// 1. Sổ địa chỉ từ menu tài khoản
// ───────────────────────────────────────────────────────────────────

export function AddressBookDialog({ onClose }: { onClose: () => void }) {
  const { data, loading, error, reload } = useApi(() => addressBookApi.list(), []);
  const [dangSua, setDangSua] = useState<UserAddress | "moi" | null>(null);
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState("");

  async function chay(viec: () => Promise<unknown>) {
    setBusy(true);
    setLoi("");
    try {
      await viec();
      reload();
    } catch (err) {
      setLoi(err instanceof Error ? err.message : "Thao tác thất bại.");
    } finally {
      setBusy(false);
    }
  }

  if (dangSua !== null) {
    return (
      <AddressFormDialog
        banDau={dangSua === "moi" ? null : dangSua}
        laDauTien={(data?.length ?? 0) === 0}
        onClose={() => setDangSua(null)}
        onSaved={() => {
          setDangSua(null);
          reload();
        }}
      />
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Địa chỉ của tôi"
      size="lg"
      footer={
        <div className="dialog-footer">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Đóng</Button>
        </div>
      }
    >
      <div className={styles.thanhCongCu}>
        <span className="muted">Dùng khi xác nhận đơn: chọn một cái là xong, không phải gõ lại.</span>
        <Button onClick={() => setDangSua("moi")} disabled={busy}>
          <Plus size={16} aria-hidden="true" /> Thêm địa chỉ
        </Button>
      </div>

      {loading && <p className="muted">Đang tải…</p>}
      {error && (
        <p className="notice notice-danger" role="alert">
          {error.status === 401
            ? "Phiên đăng nhập đã hết. Đăng nhập lại để xem sổ địa chỉ."
            : error.message}
        </p>
      )}
      {loi && <p className="notice notice-danger" role="alert">{loi}</p>}

      {data && data.length === 0 && <Trong />}

      {data && data.length > 0 && (
        <ul className={styles.danhSach}>
          {data.map((d) => (
            <li key={d.id} className={`${styles.muc} ${d.isDefault ? styles.mucMacDinh : ""}`}>
              <TheDiaChi
                d={d}
                hanhDong={
                  <>
                    <button type="button" className={styles.lienKet} disabled={busy} onClick={() => setDangSua(d)}>
                      Cập nhật
                    </button>
                    {!d.isDefault && (
                      <button
                        type="button"
                        className={`${styles.lienKet} ${styles.lienKetXoa}`}
                        disabled={busy}
                        onClick={() => chay(() => addressBookApi.remove(d.id))}
                      >
                        Xoá
                      </button>
                    )}
                  </>
                }
              />
              {!d.isDefault && (
                <button
                  type="button"
                  className={styles.nutVien}
                  disabled={busy}
                  onClick={() => chay(() => addressBookApi.setDefault(d.id))}
                >
                  Thiết lập mặc định
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────────
// 2. Popup chọn địa chỉ trên trang xác nhận
// ───────────────────────────────────────────────────────────────────

export function ChonDiaChiDialog({
  items,
  chonId,
  onChon,
  onClose,
  onDoi,
}: {
  items: UserAddress[];
  chonId: string | null;
  onChon: (id: string) => void;
  onClose: () => void;
  /** Sổ vừa đổi (thêm/sửa) — người gọi tải lại danh sách. */
  onDoi: () => void;
}) {
  const [tam, setTam] = useState<string | null>(chonId);
  const [dangSua, setDangSua] = useState<UserAddress | "moi" | null>(null);

  if (dangSua !== null) {
    return (
      <AddressFormDialog
        banDau={dangSua === "moi" ? null : dangSua}
        laDauTien={items.length === 0}
        onClose={() => setDangSua(null)}
        onSaved={(d) => {
          setDangSua(null);
          // Vừa thêm/sửa cái nào thì chọn luôn cái đó — đó là lý do
          // khách mở form từ trong popup chọn.
          setTam(d.id);
          onDoi();
        }}
      />
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Địa chỉ của tôi"
      footer={
        <div className={styles.chanChon}>
          <button type="button" className={styles.nutVien} onClick={() => setDangSua("moi")}>
            <Plus size={16} aria-hidden="true" /> Thêm địa chỉ mới
          </button>
          <span className={styles.chanPhai}>
            <Button variant="secondary" onClick={onClose}>Huỷ</Button>
            <Button
              disabled={!tam}
              onClick={() => {
                if (tam) onChon(tam);
                onClose();
              }}
            >
              Xác nhận
            </Button>
          </span>
        </div>
      }
    >
      {items.length === 0 ? (
        <Trong />
      ) : (
        <ul className={styles.danhSach} role="radiogroup" aria-label="Chọn địa chỉ nhận hàng">
          {items.map((d) => (
            <li key={d.id} className={`${styles.muc} ${styles.mucChon} ${tam === d.id ? styles.mucDangChon : ""}`}>
              <label className={styles.dongChon}>
                <input
                  type="radio"
                  name="dia-chi-nhan"
                  value={d.id}
                  checked={tam === d.id}
                  onChange={() => setTam(d.id)}
                  aria-label={`${d.recipientName} — ${docDiaChi(d)}`}
                />
                <TheDiaChi
                  d={d}
                  hanhDong={
                    <button type="button" className={styles.lienKet} onClick={() => setDangSua(d)}>
                      Cập nhật
                    </button>
                  }
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────────
// 3. Form "Địa chỉ mới" / "Cập nhật địa chỉ"
// ───────────────────────────────────────────────────────────────────

export function AddressFormDialog({
  banDau,
  laDauTien = false,
  onClose,
  onSaved,
}: {
  banDau: UserAddress | null;
  /** Địa chỉ đầu tiên của sổ: điền sẵn tên + SĐT từ hồ sơ. */
  laDauTien?: boolean;
  onClose: () => void;
  onSaved: (d: UserAddress) => void;
}) {
  const [ten, setTen] = useState(banDau?.recipientName ?? "");
  const [sdt, setSdt] = useState(banDau?.recipientPhone ?? "");
  const [tinh, setTinh] = useState(banDau?.provinceName ?? "");
  const [phuong, setPhuong] = useState(banDau?.wardCode ?? "");
  const [duong, setDuong] = useState(banDau?.streetLine ?? "");
  const [nhan, setNhan] = useState<AddressLabel | null>(banDau?.label ?? null);
  const [macDinh, setMacDinh] = useState(banDau?.isDefault ?? false);
  const [picker, setPicker] = useState<"tinh" | "phuong" | null>(null);
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState("");

  const dsTinh = useApi(() => shippingApi.provinces(), []);
  const dsPhuong = useApi(
    () => (tinh ? shippingApi.currentWards(tinh) : Promise.resolve([])),
    [tinh],
  );
  // Điền sẵn từ hồ sơ CHỈ khi thêm mới và ô còn trống — không ghi đè
  // thứ khách đã gõ, không đụng vào địa chỉ đang sửa.
  useApi(
    async () => {
      if (banDau) return null;
      const hoSo = await profileApi.get();
      setTen((cu) => cu || hoSo.fullName);
      setSdt((cu) => cu || hoSo.phone || "");
      return hoSo;
    },
    [banDau?.id],
  );

  const phuongChon = dsPhuong.refreshing ? undefined : dsPhuong.data?.find((w) => w.code === phuong);
  const chan =
    busy || ten.trim().length < 2 || sdt.trim() === "" || !tinh || !phuongChon || duong.trim().length < 3;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (chan) return;
    setBusy(true);
    setLoi("");
    const input: UserAddressInput = {
      recipientName: ten.trim(),
      recipientPhone: sdt.trim(),
      provinceName: tinh,
      wardCode: phuong,
      streetLine: duong.trim(),
      label: nhan,
      isDefault: macDinh || laDauTien,
    };
    try {
      const kq = banDau
        ? await addressBookApi.update(banDau.id, input)
        : await addressBookApi.create(input);
      onSaved(kq);
    } catch (err) {
      // Nguyên văn lời backend: khi phường không thuộc tỉnh, câu đó
      // nói đúng chuyện cần sửa.
      setLoi(err instanceof Error ? err.message : "Không lưu được địa chỉ.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={banDau ? "Cập nhật địa chỉ" : "Địa chỉ mới"}
        footer={
          <div className="dialog-footer">
            <Button variant="secondary" onClick={onClose} disabled={busy}>Trở lại</Button>
            <Button onClick={submit} disabled={chan}>{busy ? "Đang lưu…" : "Hoàn thành"}</Button>
          </div>
        }
      >
        <form onSubmit={submit} className={styles.form}>
          <div className={styles.hang}>
            <div className="field">
              <label htmlFor="sdc-ten">Họ và tên</label>
              <input id="sdc-ten" value={ten} onChange={(e) => setTen(e.target.value)} autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="sdc-sdt">Số điện thoại</label>
              <input id="sdc-sdt" inputMode="tel" value={sdt} onChange={(e) => setSdt(e.target.value)} autoComplete="tel" />
            </div>
          </div>
          <div className={styles.hang}>
            <div className="field">
              <label htmlFor="sdc-tinh">Tỉnh / Thành phố</label>
              <button id="sdc-tinh" type="button" className={styles.oChon} onClick={() => setPicker("tinh")} aria-label="Chọn tỉnh/thành">
                {tinh || "Chọn tỉnh/thành"}
              </button>
            </div>
            <div className="field">
              <label htmlFor="sdc-phuong">Phường / Xã / Đặc khu</label>
              <button id="sdc-phuong" type="button" className={styles.oChon} disabled={!tinh} onClick={() => setPicker("phuong")} aria-label="Chọn phường/xã">
                {phuongChon?.name ?? (tinh ? "Chọn phường/xã" : "Chọn tỉnh/thành trước")}
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="sdc-duong">Địa chỉ cụ thể</label>
            <input
              id="sdc-duong"
              value={duong}
              onChange={(e) => setDuong(e.target.value)}
              placeholder="Số nhà, tên đường, toà nhà…"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <span className={styles.nhanTieuDe}>Loại địa chỉ</span>
            <div className={styles.loai} role="group" aria-label="Loại địa chỉ">
              {(["HOME", "OFFICE"] as AddressLabel[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  className="chip"
                  aria-pressed={nhan === l}
                  onClick={() => setNhan(nhan === l ? null : l)}
                >
                  {l === "HOME" ? <Home size={14} aria-hidden="true" /> : <Briefcase size={14} aria-hidden="true" />}
                  {TEN_NHAN[l]}
                </button>
              ))}
            </div>
          </div>
          <label className={styles.macDinh}>
            <input
              type="checkbox"
              checked={macDinh || laDauTien}
              disabled={laDauTien || Boolean(banDau?.isDefault)}
              onChange={(e) => setMacDinh(e.target.checked)}
            />
            Đặt làm địa chỉ mặc định
            {laDauTien && <span className="muted"> (địa chỉ đầu tiên luôn là mặc định)</span>}
          </label>
          {loi && <p className="notice notice-danger" role="alert">{loi}</p>}
        </form>
      </Dialog>

      {picker === "tinh" && (
        <AddressPicker
          title="Chọn tỉnh/thành"
          items={(dsTinh.data ?? []).map((name) => ({ code: name, name }))}
          loading={dsTinh.loading || dsTinh.refreshing}
          error={Boolean(dsTinh.error)}
          onClose={() => setPicker(null)}
          onSelect={(code) => {
            if (code !== tinh) {
              setTinh(code);
              // Đổi tỉnh thì phường cũ không còn thuộc về đâu nữa.
              setPhuong("");
            }
            setPicker(null);
          }}
        />
      )}
      {picker === "phuong" && (
        <AddressPicker
          title={`Chọn phường/xã · ${tinh}`}
          items={dsPhuong.refreshing ? [] : dsPhuong.data ?? []}
          loading={dsPhuong.loading || dsPhuong.refreshing}
          error={Boolean(dsPhuong.error)}
          onClose={() => setPicker(null)}
          onSelect={(code) => {
            setPhuong(code);
            setPicker(null);
          }}
        />
      )}
    </>
  );
}
