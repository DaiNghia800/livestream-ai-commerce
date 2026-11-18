import type { Metadata } from "next";
import { RolePermissionMatrix } from "@/features/admin/role-permission-matrix";

export const metadata: Metadata = {
  title: "Ma trận Phân quyền & Vai trò | LiveOrder AI",
  description: "Cấu hình vai trò động và ma trận quyền hạn hệ thống",
};

export default function RolesPage() {
  return <RolePermissionMatrix />;
}

