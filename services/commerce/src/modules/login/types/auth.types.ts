export type UserRole = "customer" | "shop_owner" | "admin";

export interface User {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface AuthUser extends User {
  passwordHash: string;
  isActive: boolean;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  user: {
    id: number;
    email: string;
    full_name: string;
    role: string;
  };
}

export interface RequestMetadata {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface RegisterUserInput {
  email: string;
  passwordHash: string;
  fullName: string;
}

export interface ManagedUser {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
}

export interface ManagedUserUpdate {
  role?: UserRole;
  isActive?: boolean;
}

export interface ManagedUserPage {
  users: ManagedUser[];
  total: number;
}

export type ShopInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface ShopInvitation {
  id: number;
  email: string;
  fullName: string;
  shopName: string;
  status: ShopInvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  acceptedAt: Date | null;
}

export interface CreateShopInvitationInput {
  email: string;
  fullName: string;
  shopName: string;
  tokenHash: string;
  expiresAt: Date;
  createdBy: number;
}

export interface ShopInvitationPage {
  invitations: ShopInvitation[];
  total: number;
}

export interface RefreshSession {
  refreshToken: string;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}
