import { IAuthRepository } from "../repositories/auth.repository.js";
import { LoginRequest, RegisterRequest } from "../schemas/auth.schema.js";
import {
  AuthResponse,
  RefreshSession,
  RequestMetadata,
  User,
} from "../types/auth.types.js";
import { createAccessToken, createRefreshToken } from "./auth-token.service.js";
import { hashPassword, verifyPassword } from "./password.service.js";

export class EmailAlreadyExistsError extends Error {}

function createSession(user: User, metadata: RequestMetadata): RefreshSession {
  const refresh = createRefreshToken(user);
  return {
    refreshToken: refresh.token,
    expiresAt: refresh.expiresAt,
    userAgent: metadata.userAgent?.slice(0, 255) ?? null,
    ipAddress: metadata.ipAddress,
  };
}

function createAuthResponse(user: User, refreshToken: string): AuthResponse {
  return {
    access_token: createAccessToken(user),
    refresh_token: refreshToken,
    token_type: "bearer",
    user: {
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      role: user.role,
    },
  };
}

export class AuthService {
  constructor(private readonly repository: IAuthRepository) {}

  async register(
    input: RegisterRequest,
    metadata: RequestMetadata
  ): Promise<AuthResponse> {
    const passwordHash = await hashPassword(input.password);
    try {
      const result = await this.repository.registerWithSession(
        {
          email: input.email.toLowerCase(),
          passwordHash,
          fullName: input.full_name,
        },
        (user) => createSession(user, metadata)
      );
      return createAuthResponse(result.user, result.refreshToken);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new EmailAlreadyExistsError("Email đã được sử dụng");
      }
      throw error;
    }
  }

  async login(
    input: LoginRequest,
    metadata: RequestMetadata
  ): Promise<AuthResponse | null> {
    const user = await this.repository.findActiveUserByEmail(
      input.email.toLowerCase()
    );
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return null;
    }

    const session = createSession(user, metadata);
    await this.repository.createSession(user.id, session);
    return createAuthResponse(user, session.refreshToken);
  }
}
