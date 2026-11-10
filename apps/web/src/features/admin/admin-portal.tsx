"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "./admin-portal.module.css";

type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

interface ShopInvitation {
  id: number;
  email: string;
  fullName: string;
  shopName: string;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

interface InvitationResponse {
  invitations: ShopInvitation[];
  total: number;
}

const API_BASE =
  process.env.NEXT_PUBLIC_COMMERCE_API_URL ?? "http://localhost:8000";

export function AdminPortal() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [invitations, setInvitations] = useState<ShopInvitation[]>([]);
  const [form, setForm] = useState({ full_name: "", email: "", shop_name: "" });
  const [freshLink, setFreshLink] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const loadInvitations = useCallback(async (accessToken: string) => {
    const response = await fetch(`${API_BASE}/api/admin/shop-invitations`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("admin_access_token");
      localStorage.removeItem("admin_refresh_token");
      localStorage.removeItem("admin_auth_user");
      localStorage.removeItem("user_role");
      setToken("");
      router.replace("/admin");
      return;
    }
    if (!response.ok) throw new Error("Không thể tải lời mời shop.");
    const data = (await response.json()) as InvitationResponse;
    setInvitations(data.invitations);
    setToken(accessToken);
  }, [router]);

  useEffect(() => {
    if (localStorage.getItem("user_role") !== "admin") {
      router.replace(localStorage.getItem("user_role") === "shop_owner" ? "/shop" : "/admin");
      return;
    }
    const savedToken = localStorage.getItem("admin_access_token") ?? "";
    if (savedToken.length === 0) {
      router.replace("/admin");
      return;
    }
    let active = true;

    async function restoreSession() {
      try {
        const response = await fetch(`${API_BASE}/api/admin/shop-invitations`, {
          headers: { Authorization: `Bearer ${savedToken}` },
        });
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem("admin_access_token");
          localStorage.removeItem("admin_refresh_token");
          localStorage.removeItem("admin_auth_user");
          localStorage.removeItem("user_role");
          if (active) {
            router.replace("/admin");
          }
          return;
        }
        if (!response.ok) throw new Error("Không thể tải lời mời shop.");
        const data = (await response.json()) as InvitationResponse;
        if (active) {
          setInvitations(data.invitations);
          setToken(savedToken);
        }
      } catch (restoreError) {
        if (active) {
          setError(
            restoreError instanceof Error
              ? restoreError.message
              : "Không thể kết nối đến máy chủ."
          );
        }
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
  }, [router]);

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    setFreshLink("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/shop-invitations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Không thể tạo lời mời.");
      }
      setFreshLink(makeInvitationLink(data.token as string));
      setNotice("Đã tạo lời mời. Hãy sao chép link và gửi riêng cho chủ shop.");
      setForm({ full_name: "", email: "", shop_name: "" });
      await loadInvitations(token);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Không thể tạo lời mời."
      );
    } finally {
      setSaving(false);
    }
  }

  function makeInvitationLink(invitationToken: string) {
    return `${window.location.origin}/accept-shop-invitation#${invitationToken}`;
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setNotice("Đã sao chép link mời.");
    } catch {
      setError("Không thể sao chép tự động. Hãy chọn và sao chép link thủ công.");
    }
  }

  async function rotateInvitation(id: number) {
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `${API_BASE}/api/admin/shop-invitations/${id}/rotate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Không thể tạo link mới.");
      }
      setFreshLink(makeInvitationLink(data.token as string));
      setNotice("Link cũ đã bị vô hiệu hóa. Hãy sao chép và gửi link mới.");
      await loadInvitations(token);
    } catch (rotateError) {
      setError(
        rotateError instanceof Error
          ? rotateError.message
          : "Không thể tạo link mới."
      );
    }
  }

  async function revokeInvitation(id: number) {
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `${API_BASE}/api/admin/shop-invitations/${id}/revoke`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Không thể thu hồi lời mời.");
      }
      setNotice("Đã thu hồi lời mời.");
      await loadInvitations(token);
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "Không thể thu hồi lời mời."
      );
    }
  }

  if (!token) {
    return (
      <main className={styles.loading}>Đang kiểm tra quyền quản trị…</main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>ADMIN WORKSPACE</p>
          <h1>Quản trị hệ thống</h1>
          <p>Quản lý quyền truy cập và tạo không gian kinh doanh cho đối tác.</p>
        </div>
        <div className={styles.heroIcon}><Store size={30} /></div>
      </section>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      {freshLink && (
        <section className={styles.linkNotice}>
          <div>
            <strong>Link kích hoạt — chỉ hiển thị lúc này</strong>
            <p>Link dùng một lần, hết hạn sau 7 ngày. Gửi riêng cho chủ shop.</p>
            <input aria-label="Link kích hoạt shop" readOnly value={freshLink} />
          </div>
          <button onClick={() => void copyLink(freshLink)}>
            <Copy size={17} /> Sao chép link
          </button>
        </section>
      )}

      <div className={styles.contentGrid}>
        <section className={styles.card}>
          <div className={styles.sectionHeading}>
            <span className={styles.sectionIcon}><Store size={19} /></span>
            <div>
              <h2>Tạo lời mời shop</h2>
              <p>Shop tự đặt mật khẩu để kích hoạt tài khoản.</p>
            </div>
          </div>
          <form className={styles.inviteForm} onSubmit={createInvitation}>
            <label>
              Tên người đại diện
              <input
                required
                minLength={2}
                maxLength={150}
                value={form.full_name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, full_name: event.target.value }))
                }
              />
            </label>
            <label>
              Email đăng nhập
              <input
                type="email"
                required
                maxLength={255}
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
              />
            </label>
            <label>
              Tên shop
              <input
                required
                minLength={2}
                maxLength={150}
                value={form.shop_name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, shop_name: event.target.value }))
                }
              />
            </label>
            <button className={styles.primaryButton} disabled={saving}>
              {saving ? "Đang tạo…" : "Tạo link mời shop"}
            </button>
          </form>
        </section>

        <section className={`${styles.card} ${styles.processCard}`}>
          <p className={styles.eyebrow}>QUY TRÌNH AN TOÀN</p>
          <ol>
            <li><span>1</span><div><strong>Admin gửi lời mời</strong><p>Email, tên người đại diện và shop được lưu.</p></div></li>
            <li><span>2</span><div><strong>Chia sẻ link riêng</strong><p>Token ngẫu nhiên, chỉ lưu hash và hết hạn sau 7 ngày.</p></div></li>
            <li><span>3</span><div><strong>Shop tự kích hoạt</strong><p>Tài khoản và shop được tạo cùng lúc khi đặt mật khẩu.</p></div></li>
          </ol>
        </section>
      </div>

      <section className={`${styles.card} ${styles.tableCard}`}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Lời mời đã tạo</h2>
            <p>{invitations.length} lời mời gần nhất</p>
          </div>
          <button
            className={styles.refreshButton}
            onClick={() => void loadInvitations(token)}
          >
            <RefreshCw size={16} /> Làm mới
          </button>
        </div>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr><th>Shop / người đại diện</th><th>Email</th><th>Trạng thái</th><th>Hết hạn</th><th /></tr>
            </thead>
            <tbody>
              {invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td><strong>{invitation.shopName}</strong><span>{invitation.fullName}</span></td>
                  <td>{invitation.email}</td>
                  <td><span className={`${styles.status} ${styles[`status_${invitation.status}`]}`}>{{
                    pending: "Đang chờ",
                    accepted: "Đã kích hoạt",
                    revoked: "Đã thu hồi",
                    expired: "Hết hạn",
                  }[invitation.status]}</span></td>
                  <td>{new Date(invitation.expiresAt).toLocaleDateString("vi-VN")}</td>
                  <td className={styles.actions}>
                    {invitation.status !== "accepted" && (
                      <>
                        <button onClick={() => void rotateInvitation(invitation.id)}>Tạo link mới</button>
                        {invitation.status === "pending" && (
                          <button className={styles.dangerButton} onClick={() => void revokeInvitation(invitation.id)}>
                            Thu hồi
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {invitations.length === 0 && (
                <tr><td colSpan={5} className={styles.empty}>Chưa có lời mời shop nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
