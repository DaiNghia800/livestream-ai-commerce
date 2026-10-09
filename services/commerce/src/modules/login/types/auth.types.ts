export interface User {
  id: number;
  email: string;
  fullName: string;
  role: string;
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

export interface RefreshSession {
  refreshToken: string;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}
