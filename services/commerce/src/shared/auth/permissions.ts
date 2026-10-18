import { UserRole } from "./token.js";

/**
 * Standard system permissions defined in identity service.
 */
export const PERMISSIONS = {
  PRODUCT_MANAGE: "product.manage",
  INVENTORY_MANAGE: "inventory.manage",
  SESSION_MANAGE: "session.manage",
  ORDER_MANAGE: "order.manage",
  PURCHASE_REQUEST_REVIEW: "purchase_request.review",
  REPORT_VIEW: "report.view",
  ACCOUNT_MANAGE: "account.manage",
  SYSTEM_MANAGE: "system.manage",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Mapping of roles to their default permission codes.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly PermissionCode[]> = {
  customer: [],
  shop_owner: [
    PERMISSIONS.PRODUCT_MANAGE,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.SESSION_MANAGE,
    PERMISSIONS.ORDER_MANAGE,
    PERMISSIONS.PURCHASE_REQUEST_REVIEW,
    PERMISSIONS.REPORT_VIEW,
  ],
  admin: [
    PERMISSIONS.PRODUCT_MANAGE,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.SESSION_MANAGE,
    PERMISSIONS.ORDER_MANAGE,
    PERMISSIONS.PURCHASE_REQUEST_REVIEW,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.ACCOUNT_MANAGE,
    PERMISSIONS.SYSTEM_MANAGE,
  ],
};
