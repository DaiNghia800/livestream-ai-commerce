"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  CircleUserRound,
  Search,
  ShieldCheck,
  ShieldHalf,
  Store,
  UserRound,
  UsersRound,
} from "lucide-react";
import styles from "./shop-users-page.module.css";

type UserRole = "customer" | "shop_owner" | "admin";

interface ManagedUser {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

interface UserPageResponse {
  users: ManagedUser[];
  total: number;
}

const ROLE_LABELS: Record<UserRole, string> = {
  customer: "Khách hàng",
  shop_owner: "Chủ shop",
  admin: "Quản trị viên",
};

const PAGE_SIZE = 100;
const API_BASE =
  process.env.NEXT_PUBLIC_COMMERCE_API_URL ?? "http://localhost:8000";

export function ShopUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");

  useEffect(() => {
    async function loadUsers() {
      const token = localStorage.getItem("admin_access_token");
      if (!token) {
        router.replace("/admin");
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE}/api/admin/users?limit=${PAGE_SIZE}&offset=0`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (response.status === 401) {
          localStorage.removeItem("admin_access_token");
          localStorage.removeItem("admin_refresh_token");
          localStorage.removeItem("user_role");
          router.replace("/admin");
          return;
        }
        if (response.status === 403) {
          setError("Tài khoản của bạn không có quyền quản lý người dùng.");
          return;
        }
        if (!response.ok) {
          throw new Error("Không thể tải danh sách người dùng.");
        }

        const data = (await response.json()) as UserPageResponse & {
          currentUserId: number;
        };
        setUsers(data.users);
        setTotal(data.total);
        setCurrentUserId(data.currentUserId);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Không thể kết nối đến máy chủ."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadUsers();
  }, [router]);

  async function updateUser(
    userId: number,
    update: { role?: UserRole; is_active?: boolean }
  ) {
    const token = localStorage.getItem("admin_access_token");
    if (!token) {
      router.replace("/admin");
      return;
    }

    setSavingUserId(userId);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(update),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Không thể cập nhật người dùng.");
      }
      const updated = data.user as ManagedUser;
      setUsers((current) =>
        current.map((user) => (user.id === userId ? updated : user))
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Không thể cập nhật người dùng."
      );
    } finally {
      setSavingUserId(null);
    }
  }

  async function loadMore() {
    const token = localStorage.getItem("admin_access_token");
    if (!token) {
      router.replace("/admin");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/admin/users?limit=${PAGE_SIZE}&offset=${users.length}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = (await response.json()) as UserPageResponse;
      if (!response.ok) {
        throw new Error("Không thể tải thêm người dùng.");
      }
      setUsers((current) => [...current, ...data.users]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Không thể tải thêm người dùng."
      );
    } finally {
      setLoading(false);
    }
  }

  const filteredUsers = users.filter((user) => {
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const normalizedSearch = search.trim().toLocaleLowerCase("vi");
    const matchesSearch =
      normalizedSearch.length === 0 ||
      `${user.fullName} ${user.email}`
        .toLocaleLowerCase("vi")
        .includes(normalizedSearch);
    return matchesRole && matchesSearch;
  });
  const activeCount = users.filter((user) => user.isActive).length;
  const adminCount = users.filter(
    (user) => user.role === "admin" && user.isActive
  ).length;

  return (
    <main className={styles.page}>
      <div className={styles.topline}>
        <div className={styles.breadcrumb}>
          <ShieldCheck size={16} aria-hidden="true" />
          <span>Khu vực shop</span>
          <span className={styles.breadcrumbDivider}>/</span>
          <strong>Người dùng</strong>
        </div>
        <span className={styles.adminBadge}>
          <span className={styles.adminDot} />
          Quản trị viên
        </span>
      </div>

      <header className={styles.header}>
        <div>
          <h1>Quản lý người dùng</h1>
          <p className={styles.description}>
            Theo dõi tài khoản và phân quyền truy cập trên toàn hệ thống.
          </p>
        </div>
        <div className={styles.headerHint}>
          <ShieldHalf size={18} aria-hidden="true" />
          <span>Quyền quản trị được bảo vệ</span>
        </div>
      </header>

      <section className={styles.stats} aria-label="Tổng quan người dùng">
        <article className={styles.statCard}>
          <span className={`${styles.statIcon} ${styles.statIconPurple}`}>
            <UsersRound size={19} aria-hidden="true" />
          </span>
          <div>
            <span className={styles.statLabel}>Tổng tài khoản</span>
            <strong className={styles.statValue}>{total}</strong>
          </div>
          <span className={styles.statFoot}>Toàn hệ thống</span>
        </article>
        <article className={styles.statCard}>
          <span className={`${styles.statIcon} ${styles.statIconGreen}`}>
            <Check size={19} aria-hidden="true" />
          </span>
          <div>
            <span className={styles.statLabel}>Đang hoạt động</span>
            <strong className={styles.statValue}>{activeCount}</strong>
          </div>
          <span className={styles.statFoot}>Trong danh sách đã tải</span>
        </article>
        <article className={styles.statCard}>
          <span className={`${styles.statIcon} ${styles.statIconBlue}`}>
            <ShieldCheck size={19} aria-hidden="true" />
          </span>
          <div>
            <span className={styles.statLabel}>Admin hoạt động</span>
            <strong className={styles.statValue}>{adminCount}</strong>
          </div>
          <span className={styles.statFoot}>Có quyền quản trị</span>
        </article>
      </section>

      {error && (
        <div className={styles.error} role="alert">
          <span className={styles.errorMark}>!</span>
          {error}
        </div>
      )}

      <section className={styles.panel} aria-label="Danh sách người dùng">
        <div className={styles.panelHeading}>
          <div>
            <h2>Danh sách tài khoản</h2>
            <p>Quản lý quyền truy cập và trạng thái người dùng.</p>
          </div>
          <span className={styles.resultCount}>
            {filteredUsers.length} / {total}
          </span>
        </div>

        <div className={styles.toolbar}>
          <label className={styles.searchBox}>
            <Search size={18} aria-hidden="true" />
            <span className={styles.srOnly}>Tìm người dùng</span>
            <input
              type="search"
              placeholder="Tìm theo tên hoặc email..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className={styles.filterBox}>
            <span className={styles.filterLabel}>Vai trò</span>
            <span className={styles.selectWrap}>
              <select
                aria-label="Lọc theo vai trò"
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(event.target.value as UserRole | "all")
                }
              >
                <option value="all">Tất cả vai trò</option>
                {Object.entries(ROLE_LABELS).map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </span>
          </label>
        </div>

        {loading && users.length === 0 ? (
          <div className={styles.loadingState}>
            <span className={styles.spinner} />
            <span>Đang tải danh sách người dùng...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              <CircleUserRound size={26} aria-hidden="true" />
            </span>
            <strong>
              {users.length ? "Không tìm thấy người dùng" : "Chưa có tài khoản"}
            </strong>
            <span>
              {users.length
                ? "Thử thay đổi từ khóa hoặc bộ lọc vai trò."
                : "Tài khoản mới sẽ xuất hiện tại đây."}
            </span>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>Ngày tham gia</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const isSelf = user.id === currentUserId;
                  const isSaving = savingUserId === user.id;
                  const initials = user.fullName
                    .trim()
                    .split(/\s+/)
                    .slice(-2)
                    .map((part) => part[0])
                    .join("")
                    .toLocaleUpperCase("vi");
                  return (
                    <tr key={user.id}>
                      <td>
                        <div className={styles.userCell}>
                          <span className={styles.avatar} aria-hidden="true">
                            {initials || <UserRound size={18} />}
                          </span>
                          <span className={styles.userInfo}>
                            <strong>
                              {user.fullName}
                              {isSelf && <span className={styles.self}>Bạn</span>}
                            </strong>
                            <span className={styles.email}>{user.email}</span>
                          </span>
                        </div>
                      </td>
                      <td>
                        <label className={styles.roleSelect}>
                          <span className={styles.srOnly}>
                            Vai trò của {user.email}
                          </span>
                          <span className={styles.roleIcon}>
                            {user.role === "admin" ? (
                              <ShieldCheck size={15} aria-hidden="true" />
                            ) : user.role === "shop_owner" ? (
                              <Store size={15} aria-hidden="true" />
                            ) : (
                              <UserRound size={15} aria-hidden="true" />
                            )}
                          </span>
                          <select
                            value={user.role}
                            disabled={isSelf || isSaving}
                            onChange={(event) =>
                              void updateUser(user.id, {
                                role: event.target.value as UserRole,
                              })
                            }
                          >
                            {Object.entries(ROLE_LABELS).map(([role, label]) => (
                              <option key={role} value={role}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={14} aria-hidden="true" />
                        </label>
                      </td>
                      <td>
                        <label className={styles.statusControl}>
                          <input
                            type="checkbox"
                            checked={user.isActive}
                            disabled={isSelf || isSaving}
                            onChange={(event) =>
                              void updateUser(user.id, {
                                is_active: event.target.checked,
                              })
                            }
                          />
                          <span
                            className={`${styles.statusBadge} ${
                              user.isActive ? styles.statusActive : styles.statusInactive
                            }`}
                          >
                            <span className={styles.statusDot} />
                            {user.isActive ? "Hoạt động" : "Đã khóa"}
                          </span>
                        </label>
                      </td>
                      <td>
                        <span className={styles.date}>
                          {new Date(user.createdAt).toLocaleDateString("vi-VN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </td>
                      <td className={styles.actionCell}>
                        {isSaving ? (
                          <span className={styles.saving}>Đang lưu...</span>
                        ) : (
                          <span className={styles.actionHint}>
                            {isSelf ? "Tài khoản của bạn" : "Có thể chỉnh sửa"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {users.length < total && (
          <button
            className={styles.loadMore}
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
          >
            {loading ? "Đang tải..." : "Tải thêm"}
          </button>
        )}
      </section>
      <div className={styles.securityNote}>
        <ShieldCheck size={17} aria-hidden="true" />
        <p>
          Bạn không thể tự đổi quyền của mình. Hệ thống cũng bảo vệ admin hoạt
          động cuối cùng để tránh mất quyền quản trị.
        </p>
      </div>
    </main>
  );
}
