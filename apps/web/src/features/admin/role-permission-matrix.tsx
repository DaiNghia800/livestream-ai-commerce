"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Plus,
  Save,
  Shield,
  ShieldCheck,
  X,
} from "lucide-react";
import styles from "./role-permission-matrix.module.css";

export interface PermissionItem {
  id: number;
  code: string;
  name: string;
  module: string;
  description: string | null;
}

export interface RoleItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

const MODULE_ORDER = [
  "livestream",
  "products",
  "inventory",
  "orders",
  "review_queue",
  "payments",
  "shipping",
  "users",
  "invitations",
  "roles",
];

const MODULE_NAMES: Record<string, string> = {
  livestream: "Livestream & Studio",
  products: "Sản phẩm & Biến thể",
  inventory: "Tồn kho & Kho hàng",
  orders: "Đơn hàng & Xử lý",
  review_queue: "Hàng đợi duyệt đơn AI",
  payments: "Thanh toán & Sổ quỹ",
  shipping: "Vận chuyển & Vận đơn",
  users: "Người dùng & Nhân sự",
  invitations: "Lời mời tham gia Shop",
  roles: "Ma trận Phân quyền",
};

const DEFAULT_PERMISSIONS: PermissionItem[] = [
  { id: 1, code: "livestream:view", name: "Xem danh sách Livestream", module: "livestream", description: "Xem danh sách và chi tiết các phiên livestream" },
  { id: 2, code: "livestream:manage", name: "Quản lý & Phát Studio", module: "livestream", description: "Tạo, chỉnh sửa, xóa phiên và điều khiển Studio" },
  { id: 3, code: "products:view", name: "Xem danh mục Sản phẩm", module: "products", description: "Xem danh mục sản phẩm và biến thể SKU" },
  { id: 4, code: "products:manage", name: "Quản lý & Chỉnh sửa Sản phẩm", module: "products", description: "Thêm mới, sửa thông tin, giá bán và biến thể" },
  { id: 5, code: "inventory:view", name: "Xem Báo cáo Tồn kho", module: "inventory", description: "Xem tồn kho thực tế, đang giữ và khả dụng" },
  { id: 6, code: "inventory:adjust", name: "Điều chỉnh & Kiểm kê Tồn kho", module: "inventory", description: "Tạo phiếu điều chỉnh tăng/giảm tồn kho" },
  { id: 7, code: "orders:view", name: "Xem danh sách Đơn hàng", module: "orders", description: "Xem danh sách đơn và chi tiết đơn hàng" },
  { id: 8, code: "orders:manage", name: "Xử lý & Đóng gói Đơn hàng", module: "orders", description: "Đóng gói, hủy đơn, xuất Excel và in phiếu giao hàng" },
  { id: 9, code: "review_queue:view", name: "Xem Hàng đợi Duyệt AI", module: "review_queue", description: "Xem các bình luận chốt đơn AI cần duyệt" },
  { id: 10, code: "review_queue:manage", name: "Duyệt Đơn AI", module: "review_queue", description: "Duyệt thành đơn hoặc từ chối đề xuất chốt đơn" },
  { id: 11, code: "payments:view", name: "Xem Sổ Thanh toán", module: "payments", description: "Xem danh sách giao dịch và sổ thanh toán" },
  { id: 12, code: "payments:manage", name: "Đối soát & Hoàn tiền", module: "payments", description: "Xử lý lệch tiền, hoàn tiền và tạo link thanh toán" },
  { id: 13, code: "shipping:view", name: "Xem danh sách Vận đơn", module: "shipping", description: "Xem danh sách vận đơn và hành trình giao hàng" },
  { id: 14, code: "shipping:manage", name: "Điều phối & Giao hàng", module: "shipping", description: "Tạo vận đơn và điều phối giao hàng" },
  { id: 15, code: "users:view", name: "Xem danh sách Tài khoản", module: "users", description: "Xem danh sách tài khoản khách hàng và nhân viên" },
  { id: 16, code: "users:manage", name: "Phân quyền Người dùng", module: "users", description: "Đổi vai trò, khóa hoặc mở khóa tài khoản người dùng" },
  { id: 17, code: "invitations:manage", name: "Quản lý Lời mời Shop", module: "invitations", description: "Tạo và thu hồi lời mời tham gia gian hàng" },
  { id: 18, code: "roles:manage", name: "Cấu hình Ma trận Phân quyền", module: "roles", description: "Tạo vai trò mới và cấu hình ma trận quyền hạn" },
];

const DEFAULT_ROLES: RoleItem[] = [
  {
    id: 1,
    code: "admin",
    name: "Quản trị viên hệ thống",
    description: "Toàn quyền quản trị toàn bộ hệ thống và phân quyền",
    isSystem: true,
    permissions: DEFAULT_PERMISSIONS.map((p) => p.code),
  },
  {
    id: 2,
    code: "shop_owner",
    name: "Chủ shop / Quản lý",
    description: "Quản lý vận hành toàn bộ gian hàng, sản phẩm, đơn và kho",
    isSystem: true,
    permissions: [
      "livestream:view", "livestream:manage",
      "products:view", "products:manage",
      "inventory:view", "inventory:adjust",
      "orders:view", "orders:manage",
      "review_queue:view", "review_queue:manage",
      "payments:view", "payments:manage",
      "shipping:view", "shipping:manage",
    ],
  },
  {
    id: 3,
    code: "warehouse",
    name: "Thủ kho",
    description: "Chuyên trách quản lý tồn kho, nhập xuất và vận chuyển",
    isSystem: false,
    permissions: [
      "inventory:view", "inventory:adjust",
      "shipping:view", "shipping:manage",
      "orders:view", "products:view",
    ],
  },
  {
    id: 4,
    code: "staff",
    name: "Nhân viên bán hàng",
    description: "Hỗ trợ phiên live, theo dõi đơn hàng và duyệt đơn AI",
    isSystem: false,
    permissions: [
      "livestream:view",
      "orders:view", "orders:manage",
      "review_queue:view", "review_queue:manage",
      "products:view",
    ],
  },
];

const API_BASE =
  process.env.NEXT_PUBLIC_COMMERCE_API_URL ?? "http://localhost:8000";

export function RolePermissionMatrix() {
  const [permissions, setPermissions] = useState<PermissionItem[]>(DEFAULT_PERMISSIONS);
  const [roles, setRoles] = useState<RoleItem[]>(DEFAULT_ROLES);
  const [matrix, setMatrix] = useState<Record<number, Set<string>>>({});
  const [dirtyRoleIds, setDirtyRoleIds] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Modal create role
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);

  // Load roles & permissions from API
  useEffect(() => {
    async function loadData() {
      const token =
        localStorage.getItem("admin_access_token") ||
        localStorage.getItem("access_token");
      if (!token) return;

      try {
        const [permsRes, rolesRes] = await Promise.all([
          fetch(`${API_BASE}/api/admin/permissions`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/api/admin/roles`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (permsRes.ok) {
          const permsData = await permsRes.json();
          if (Array.isArray(permsData.permissions) && permsData.permissions.length > 0) {
            setPermissions(permsData.permissions);
          }
        }

        if (rolesRes.ok) {
          const rolesData = await rolesRes.json();
          if (Array.isArray(rolesData.roles) && rolesData.roles.length > 0) {
            // Lọc bỏ vai trò 'customer' vì không thuộc phân quyền quản trị
            const adminRoles = rolesData.roles.filter((r: RoleItem) => r.code !== "customer");
            setRoles(adminRoles);
            const initialMatrix: Record<number, Set<string>> = {};
            for (const role of adminRoles) {
              initialMatrix[role.id] = new Set(role.permissions);
            }
            setMatrix(initialMatrix);
            return;
          }
        }
      } catch (err) {
        console.warn("[RolePermissionMatrix] Using offline mock data:", err);
      }

      // Initialize with default data if offline (không bao gồm customer)
      const initialMatrix: Record<number, Set<string>> = {};
      for (const role of DEFAULT_ROLES) {
        initialMatrix[role.id] = new Set(role.permissions);
      }
      setMatrix(initialMatrix);
    }

    loadData();
  }, []);

  // Group permissions by module with clean business ordering
  const orderedModuleGroups = useMemo(() => {
    const grouped: Record<string, PermissionItem[]> = {};
    for (const perm of permissions) {
      if (!grouped[perm.module]) grouped[perm.module] = [];
      grouped[perm.module].push(perm);
    }

    // Sort according to MODULE_ORDER
    const result: Array<{ moduleKey: string; title: string; perms: PermissionItem[] }> = [];
    for (const mod of MODULE_ORDER) {
      if (grouped[mod] && grouped[mod].length > 0) {
        result.push({
          moduleKey: mod,
          title: MODULE_NAMES[mod] || mod,
          perms: grouped[mod],
        });
      }
    }

    // Any remaining modules not in list
    for (const [key, list] of Object.entries(grouped)) {
      if (!MODULE_ORDER.includes(key)) {
        result.push({
          moduleKey: key,
          title: MODULE_NAMES[key] || key,
          perms: list,
        });
      }
    }

    return result;
  }, [permissions]);

  // Toggle permission
  function togglePermission(roleId: number, permCode: string, isSystemAdmin: boolean) {
    if (isSystemAdmin) return; // Admin has permanent full access

    setMatrix((prev) => {
      const currentRolePerms = new Set(prev[roleId] ?? []);
      if (currentRolePerms.has(permCode)) {
        currentRolePerms.delete(permCode);
      } else {
        currentRolePerms.add(permCode);
      }

      setDirtyRoleIds((prevDirty) => new Set([...prevDirty, roleId]));

      return {
        ...prev,
        [roleId]: currentRolePerms,
      };
    });
  }

  // Save changes to API
  async function saveChanges() {
    if (dirtyRoleIds.size === 0) return;
    setIsSaving(true);
    const token =
      localStorage.getItem("admin_access_token") ||
      localStorage.getItem("access_token");

    try {
      for (const roleId of dirtyRoleIds) {
        const permsList = Array.from(matrix[roleId] ?? []);
        if (token) {
          await fetch(`${API_BASE}/api/admin/roles/${roleId}/permissions`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ permissions: permsList }),
          });
        }
      }

      setDirtyRoleIds(new Set());
      setToast("Đã lưu ma trận phân quyền thành công!");
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error("[RolePermissionMatrix] Failed to save:", err);
      setToast("Lỗi khi lưu phân quyền");
    } finally {
      setIsSaving(false);
    }
  }

  function slugifyRoleName(name: string): string {
    const slug = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return slug || `role_${Date.now().toString(36)}`;
  }

  // Submit new role
  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsCreating(true);
    const token =
      localStorage.getItem("admin_access_token") ||
      localStorage.getItem("access_token");

    let code = slugifyRoleName(newName);
    if (roles.some((r) => r.code === code)) {
      code = `${code}_${Date.now().toString().slice(-4)}`;
    }

    try {
      const payload = {
        code,
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        permissions: Array.from(newPerms),
      };

      let newRoleItem: RoleItem;

      if (token) {
        const res = await fetch(`${API_BASE}/api/admin/roles`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || "Tạo vai trò thất bại");
        }
        const data = await res.json();
        newRoleItem = data.role;
      } else {
        newRoleItem = {
          id: Date.now(),
          code: payload.code,
          name: payload.name,
          description: payload.description || null,
          isSystem: false,
          permissions: payload.permissions,
        };
      }

      setRoles((prev) => [...prev, newRoleItem]);
      setMatrix((prev) => ({
        ...prev,
        [newRoleItem.id]: new Set(newRoleItem.permissions),
      }));

      setModalOpen(false);
      setNewName("");
      setNewDesc("");
      setNewPerms(new Set());
      setToast(`Đã tạo vai trò "${payload.name}" thành công!`);
      setTimeout(() => setToast(null), 3500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Có lỗi xảy ra khi tạo vai trò";
      alert(message);
    } finally {
      setIsCreating(false);
    }
  }

  // Filter out customer and admin roles from matrix view (admin always has full access)
  const displayRoles = useMemo(() => {
    return roles.filter((r) => r.code !== "customer" && r.code !== "admin");
  }, [roles]);

  return (
    <div className={styles.container}>
      {/* Topline & Breadcrumb */}
      <div className={styles.topline}>
        <div className={styles.breadcrumb}>
          <Shield size={16} aria-hidden="true" />
          <span>Hệ thống</span>
          <span className={styles.breadcrumbDivider}>/</span>
          <strong>Phân quyền & Vai trò</strong>
        </div>
      </div>

      {/* Header Area */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Phân quyền & Vai trò</h1>
          <p className={styles.description}>
            Cấu hình quyền hạn truy cập theo từng module nghiệp vụ cho các vai trò trong hệ thống.
          </p>
          <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
            <Link
              href="/admin/users"
              style={{
                padding: "7px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                background: "#f1f5f9",
                color: "#475569",
                textDecoration: "none",
              }}
            >
              Danh sách tài khoản
            </Link>
            <Link
              href="/admin/roles"
              style={{
                padding: "7px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                background: "#6366f1",
                color: "white",
                textDecoration: "none",
              }}
            >
              Phân quyền
            </Link>
          </div>
        </div>

        <div className={styles.actions}>
          {dirtyRoleIds.size > 0 && (
            <button
              type="button"
              className={styles.saveBtn}
              onClick={saveChanges}
              disabled={isSaving}
            >
              <Save size={16} aria-hidden="true" />
              <span>{isSaving ? "Đang lưu..." : `Lưu thay đổi (${dirtyRoleIds.size})`}</span>
            </button>
          )}

          <button
            type="button"
            className={styles.createBtn}
            onClick={() => setModalOpen(true)}
          >
            <Plus size={16} aria-hidden="true" />
            <span>Thêm vai trò mới</span>
          </button>
        </div>
      </header>

      {/* Roles Cards Grid */}
      <div className={styles.rolesGrid}>
        {displayRoles.map((role) => {
          const permCount = (matrix[role.id] ?? new Set()).size;
          return (
            <div key={role.id} className={styles.roleCard}>
              <div className={styles.roleCardHeader}>
                <span className={styles.roleName}>{role.name}</span>
                <span className={role.isSystem ? styles.badgeSystem : styles.badgeCustom}>
                  {role.isSystem ? "Hệ thống" : "Tùy chỉnh"}
                </span>
              </div>
              <p className={styles.roleDesc}>{role.description || "Chưa có mô tả chi tiết."}</p>
              <div className={styles.roleCount}>
                <ShieldCheck size={14} aria-hidden="true" />
                <span>{permCount} quyền hoạt động</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Admin Full Access Notice */}
      <div className={styles.adminNotice}>
        <div className={styles.adminNoticeIcon}>
          <ShieldCheck size={20} />
        </div>
        <div className={styles.adminNoticeText}>
          <strong>Quản trị viên hệ thống (Super Admin)</strong> mặc định sở hữu toàn quyền quản trị và điều hành toàn bộ tính năng.
          Bảng ma trận dưới đây dùng để phân quyền linh hoạt cho các vai trò vận hành, chủ shop và nhân viên.
        </div>
      </div>

      {/* Matrix Table Panel */}
      <div className={styles.matrixPanel}>
        <div className={styles.matrixHeaderBar}>
          <span className={styles.matrixHeaderTitle}>Bảng chi tiết quyền hạn theo vai trò</span>
          <span style={{ fontSize: "13px", color: "#64748b" }}>
            Tick chọn để cấp quyền hoặc bỏ chọn để thu hồi
          </span>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.matrixTable}>
            <colgroup>
              <col style={{ width: "34%" }} />
              {displayRoles.map((r) => (
                <col key={r.id} style={{ width: `${66 / displayRoles.length}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>Chức năng / Quyền hạn</th>
                {displayRoles.map((r) => (
                  <th key={r.id} style={{ textAlign: "center" }}>
                    <div>{r.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orderedModuleGroups.map((group) => (
                <ModuleRows
                  key={group.moduleKey}
                  moduleTitle={group.title}
                  perms={group.perms}
                  roles={displayRoles}
                  matrix={matrix}
                  onToggle={togglePermission}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={styles.toast}>
          <CheckCircle2 size={18} color="#10b981" />
          <span>{toast}</span>
        </div>
      )}

      {/* Modal Add Role */}
      {modalOpen && (
        <div className={styles.modalOverlay} onClick={() => setModalOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Thêm vai trò mới</h2>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateRole} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className={styles.formGroup}>
                <label>Tên vai trò *</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Kế toán, Trưởng nhóm Marketing, Trợ lý..."
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Mô tả nhiệm vụ</label>
                <textarea
                  rows={2}
                  placeholder="Mô tả phạm vi trách nhiệm của vai trò này..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Chọn nhanh các quyền ban đầu ({newPerms.size})</label>
                <div style={{ maxHeight: "180px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px" }}>
                  {permissions.map((p) => (
                    <label
                      key={p.code}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "13px",
                        padding: "4px 0",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={newPerms.has(p.code)}
                        onChange={(e) => {
                          const next = new Set(newPerms);
                          if (e.target.checked) next.add(p.code);
                          else next.delete(p.code);
                          setNewPerms(next);
                        }}
                      />
                      <span>{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setModalOpen(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={isCreating || !newName.trim()}
                >
                  {isCreating ? "Đang tạo..." : "Tạo vai trò"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ModuleRows({
  moduleTitle,
  perms,
  roles,
  matrix,
  onToggle,
}: {
  moduleTitle: string;
  perms: PermissionItem[];
  roles: RoleItem[];
  matrix: Record<number, Set<string>>;
  onToggle: (roleId: number, code: string, isSystemAdmin: boolean) => void;
}) {
  return (
    <>
      <tr className={styles.moduleHeaderRow}>
        <td colSpan={roles.length + 1}>{moduleTitle}</td>
      </tr>
      {perms.map((p) => (
        <tr key={p.code}>
          <td>
            <div className={styles.permItem}>
              <span className={styles.permName}>{p.name}</span>
              {p.description && (
                <span className={styles.permDesc}>{p.description}</span>
              )}
            </div>
          </td>
          {roles.map((r) => {
            const has = matrix[r.id]?.has(p.code) ?? false;
            return (
              <td key={r.id} className={styles.checkCell}>
                <input
                  type="checkbox"
                  className={styles.checkboxInput}
                  checked={has}
                  onChange={() => onToggle(r.id, p.code, false)}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
