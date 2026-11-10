import { createHmac, timingSafeEqual } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { config } from "../../config.js";
import { IAuthRepository } from "../../modules/login/repositories/auth.repository.js";
import { UserRole } from "../../modules/login/types/auth.types.js";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: number;
        role: UserRole;
      };
    }
  }
}

interface AccessTokenPayload {
  sub: string;
  type: "access";
  exp: number;
}

function parseAccessToken(token: string): AccessTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8")
    ) as { alg?: unknown; typ?: unknown };
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;

    const expectedSignature = createHmac("sha256", config.secretKey)
      .update(`${parts[0]}.${parts[1]}`)
      .digest();
    const actualSignature = Buffer.from(parts[2], "base64url");
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    ) as Partial<AccessTokenPayload>;
    if (
      payload.type !== "access" ||
      typeof payload.sub !== "string" ||
      !/^[1-9]\d*$/.test(payload.sub) ||
      !Number.isSafeInteger(Number(payload.sub)) ||
      typeof payload.exp !== "number" ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function authenticate(repository: IAuthRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authorization = req.get("authorization");
    const match = authorization?.match(/^Bearer ([^\s]+)$/i);
    const payload = match ? parseAccessToken(match[1]) : null;
    if (!payload) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Cần đăng nhập bằng access token hợp lệ",
      });
      return;
    }

    try {
      const user = await repository.findActiveUserById(Number(payload.sub));
      if (!user) {
        res.status(401).json({
          error: "Unauthorized",
          message: "Tài khoản không hoạt động hoặc không tồn tại",
        });
        return;
      }
      req.auth = { userId: user.id, role: user.role };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth || !allowedRoles.includes(req.auth.role)) {
      res.status(403).json({
        error: "Forbidden",
        message: "Bạn không có quyền thực hiện thao tác này",
      });
      return;
    }
    next();
  };
}
