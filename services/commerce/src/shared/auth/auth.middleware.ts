import { Request, Response, NextFunction } from "express";
import { config } from "../../config.js";
import { IAuthRepository } from "../../modules/login/repositories/auth.repository.js";
import { UserRole, verifyAccessToken, TokenVerificationError } from "./token.js";

// ---------------------------------------------------------------------------
// Express Request augmentation
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      /** Populated by `authenticate` or `optionalAuthenticate` after JWT verification. */
      auth?: {
        userId: number;
        role: UserRole;
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Middleware factory return type
// ---------------------------------------------------------------------------

export interface AuthMiddleware {
  /**
   * Requires a valid "Authorization: Bearer <token>" header.
   * - Missing / malformed / expired token → 401
   * - User is_active=false → 401
   * - On success, populates req.auth = { userId, role }
   */
  authenticate: (req: Request, res: Response, next: NextFunction) => Promise<void>;

  /**
   * Optional authentication.
   * - No Authorization header → passes through as anonymous (req.auth stays undefined)
   * - Header present but token invalid → 401 (does NOT silently ignore)
   * - Valid token → populates req.auth
   */
  optionalAuthenticate: (req: Request, res: Response, next: NextFunction) => Promise<void>;

  /**
   * Role guard. Must be placed after `authenticate`.
   * - req.auth missing → 401
   * - role not in allowed list → 403
   */
  requireRole: (...roles: UserRole[]) => (req: Request, res: Response, next: NextFunction) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return parts[1] ?? null;
}

function sendUnauthorized(res: Response, message: string): void {
  res.status(401).json({ error: "Unauthorized", message });
}

function sendForbidden(res: Response, message: string): void {
  res.status(403).json({ error: "Forbidden", message });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates auth middleware functions bound to a specific repository instance.
 * Using a factory enables injecting an in-memory repository during tests.
 */
export function createAuthMiddleware(
  authRepository: IAuthRepository
): AuthMiddleware {
  async function resolveUser(
    token: string,
    res: Response
  ): Promise<{ userId: number; role: UserRole } | null> {
    let verified: { userId: number; role: UserRole };
    try {
      verified = verifyAccessToken(token, config.secretKey);
    } catch (err) {
      const message =
        err instanceof TokenVerificationError
          ? err.message
          : "Token verification failed";
      sendUnauthorized(res, message);
      return null;
    }

    const user = await authRepository.findActiveUserById(verified.userId);
    if (!user) {
      sendUnauthorized(res, "User account is inactive or does not exist");
      return null;
    }

    return { userId: verified.userId, role: verified.role };
  }

  const authenticate: AuthMiddleware["authenticate"] = async (req, res, next) => {
    const token = extractBearerToken(req);
    if (!token) {
      sendUnauthorized(res, "Authentication required. Please provide a Bearer token.");
      return;
    }

    const auth = await resolveUser(token, res);
    if (!auth) return; // response already sent

    req.auth = auth;
    next();
  };

  const optionalAuthenticate: AuthMiddleware["optionalAuthenticate"] = async (
    req,
    res,
    next
  ) => {
    const token = extractBearerToken(req);
    if (!token) {
      // No header — proceed as anonymous
      next();
      return;
    }

    // Header present but token invalid → 401 (do NOT silently treat as anonymous)
    const auth = await resolveUser(token, res);
    if (!auth) return; // response already sent

    req.auth = auth;
    next();
  };

  const requireRole: AuthMiddleware["requireRole"] =
    (...roles) =>
    (req, res, next) => {
      if (!req.auth) {
        sendUnauthorized(res, "Authentication required");
        return;
      }
      if (!roles.includes(req.auth.role)) {
        sendForbidden(
          res,
          `Access denied. Required role: ${roles.join(" or ")}`
        );
        return;
      }
      next();
    };

  return { authenticate, optionalAuthenticate, requireRole };
}
