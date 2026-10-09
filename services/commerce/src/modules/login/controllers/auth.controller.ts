import { Request, Response } from "express";
import { ZodError } from "zod";
import {
  LoginRequestSchema,
  RegisterRequestSchema,
} from "../schemas/auth.schema.js";
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
}
