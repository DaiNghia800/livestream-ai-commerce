"use client";

/**
 * Hồ sơ cá nhân — họ tên và số điện thoại.
 *
 * Mục đích duy nhất ở phía khách: điền sẵn hai ô đó khi thêm địa chỉ
 * nhận hàng. Email chỉ hiển thị, không sửa ở đây: đổi email là đổi
 * định danh đăng nhập, cần luồng xác minh riêng.
 */

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { profileApi, type Profile } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import styles from "./address-book-dialog.module.css";

export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { data, loading, error } = useApi(() => profileApi.get(), []);

  if (loading || !data) {
    return (
      <Dialog open onClose={onClose} title="Thông tin cá nhân">
        {error ? (
          <p className="notice notice-danger" role="alert">
            {error.status === 401 ? "Phiên đăng nhập đã hết. Đăng nhập lại." : error.message}
          </p>
        ) : (
          <p className="muted">Đang tải…</p>
        )}
      </Dialog>
    );
  }
  return <ProfileForm hoSo={data} onClose={onClose} />;
}

function ProfileForm({ hoSo, onClose }: { hoSo: Profile; onClose: () => void }) {
  const [ten, setTen] = useState(hoSo.fullName);
  const [sdt, setSdt] = useState(hoSo.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState("");
  const [daLuu, setDaLuu] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || ten.trim().length < 2) return;
    setBusy(true);
    setLoi("");
    try {
      const kq = await profileApi.update({ fullName: ten.trim(), phone: sdt.trim() || null });
      // Tên trên đầu trang đọc từ localStorage; cập nhật rồi báo cho
      // header biết. Sự kiện "storage" vốn chỉ bắn sang tab khác, nên
      // phải tự phát cho chính tab này.
      try {
        const cu = JSON.parse(localStorage.getItem("auth_user") ?? "{}") as Record<string, unknown>;
        localStorage.setItem("auth_user", JSON.stringify({ ...cu, full_name: kq.fullName }));
        window.dispatchEvent(new StorageEvent("storage", { key: "auth_user" }));
      } catch {
        // localStorage bị chặn thì header giữ tên cũ tới lần đăng nhập sau.
      }
      setDaLuu(true);
    } catch (err) {
      setLoi(err instanceof Error ? err.message : "Không lưu được hồ sơ.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Thông tin cá nhân"
      footer={
        <div className="dialog-footer">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Đóng</Button>
          <Button onClick={submit} disabled={busy || ten.trim().length < 2}>
            {busy ? "Đang lưu…" : "Lưu"}
          </Button>
        </div>
      }
    >
      <form onSubmit={submit} className={styles.form}>
        <div className="field">
          <label htmlFor="hs-email">Email</label>
          <input id="hs-email" value={hoSo.email} readOnly aria-readonly="true" />
          <p className="muted">Email là tên đăng nhập, không đổi tại đây.</p>
        </div>
        <div className={styles.hang}>
          <div className="field">
            <label htmlFor="hs-ten">Họ và tên</label>
            <input id="hs-ten" value={ten} onChange={(e) => setTen(e.target.value)} maxLength={150} autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor="hs-sdt">Số điện thoại</label>
            <input id="hs-sdt" inputMode="tel" value={sdt} onChange={(e) => setSdt(e.target.value)} maxLength={20} autoComplete="tel" placeholder="0901 234 567" />
          </div>
        </div>
        <p className="muted">Hai ô này sẽ được điền sẵn khi bạn thêm địa chỉ nhận hàng.</p>
        {daLuu && !loi && <p className="notice notice-info" role="status">Đã lưu hồ sơ.</p>}
        {loi && <p className="notice notice-danger" role="alert">{loi}</p>}
      </form>
    </Dialog>
  );
}
