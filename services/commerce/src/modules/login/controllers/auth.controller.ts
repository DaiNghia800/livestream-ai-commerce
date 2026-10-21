import { createHash } from "node:crypto";
import { Request, Response } from "express";
import { ZodError } from "zod";
import {
  AcceptShopInvitationSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
} from "../schemas/auth.schema.js";
import { hashPassword } from "../services/password.service.js";
import {
  AuthService,
  EmailAlreadyExistsError,
} from "../services/auth.service.js";

function requestMetadata(req: Request) {
  return {
    userAgent: req.get("user-agent") ?? null,
    ipAddress: req.ip || null,
  };
}

function respondWithValidationError(res: Response, error: ZodError): void {
  res.status(400).json({
    detail: error.issues.map((issue) => issue.message).join("; "),
  });
}

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const parsed = RegisterRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      respondWithValidationError(res, parsed.error);
      return;
    }

    try {
      const result = await this.authService.register(
        parsed.data,
        requestMetadata(req)
      );
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof EmailAlreadyExistsError) {
        res.status(409).json({ detail: error.message });
        return;
      }

      console.error("[AuthController] Registration failed:", error);
      res.status(500).json({ detail: "Đăng ký thất bại. Vui lòng thử lại." });
    }
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const parsed = LoginRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      respondWithValidationError(res, parsed.error);
      return;
    }

    try {
      const result = await this.authService.login(
        parsed.data,
        requestMetadata(req)
      );
      if (!result) {
        res.status(401).json({ detail: "Email hoặc mật khẩu không đúng" });
        return;
      }
      res.status(200).json(result);
    } catch (error) {
      console.error("[AuthController] Login failed:", error);
      res.status(500).json({ detail: "Đăng nhập thất bại. Vui lòng thử lại." });
    }
  };

  acceptShopInvitation = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const parsed = AcceptShopInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      respondWithValidationError(res, parsed.error);
      return;
    }
    try {
      const tokenHash = createHash("sha256")
        .update(parsed.data.token)
        .digest("hex");
      const tokenStatus =
        await this.authService.checkShopInvitationToken(tokenHash);
      if (tokenStatus !== "valid") {
        res.status(400).json({
          detail:
            tokenStatus === "expired"
              ? "Lời mời đã hết hạn. Vui lòng liên hệ quản trị viên."
              : "Lời mời không hợp lệ hoặc đã được sử dụng.",
        });
        return;
      }
      const result = await this.authService.acceptShopInvitation(
        tokenHash,
        await hashPassword(parsed.data.password)
      );
      if (result === "accepted") {
        res.status(201).json({
          message: "Kích hoạt tài khoản shop thành công. Bạn có thể đăng nhập.",
        });
        return;
      }
      if (result === "email_exists") {
        res.status(409).json({
          detail: "Email này đã được sử dụng. Vui lòng liên hệ quản trị viên.",
        });
        return;
      }
      res.status(400).json({
        detail:
          result === "expired"
            ? "Lời mời đã hết hạn. Vui lòng liên hệ quản trị viên."
            : "Lời mời không hợp lệ hoặc đã được sử dụng.",
      });
    } catch (error) {
      console.error("[AuthController] Shop invitation acceptance failed:", error);
      res.status(500).json({
        detail: "Không thể kích hoạt tài khoản shop. Vui lòng thử lại.",
      });
    }
  };
}
