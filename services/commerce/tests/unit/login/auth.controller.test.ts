import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { AuthController } from "../../../src/modules/login/controllers/auth.controller.js";
import { AuthService, EmailAlreadyExistsError } from "../../../src/modules/login/services/auth.service.js";

describe("AuthController Unit Tests", () => {
  let controller: AuthController;
  let mockAuthService: {
    register: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    checkShopInvitationToken: ReturnType<typeof vi.fn>;
    acceptShopInvitation: ReturnType<typeof vi.fn>;
  };
  let req: Partial<Request>;
  let res: Partial<Response>;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuthService = {
      register: vi.fn(),
      login: vi.fn(),
      checkShopInvitationToken: vi.fn(),
      acceptShopInvitation: vi.fn(),
    };
    controller = new AuthController(mockAuthService as unknown as AuthService);

    statusMock = vi.fn().mockReturnThis();
    jsonMock = vi.fn().mockReturnThis();
    req = {
      body: {},
      get: vi.fn().mockReturnValue("Mozilla/5.0"),
      ip: "127.0.0.1",
    };
    res = {
      status: statusMock,
      json: jsonMock,
    };
  });

  describe("register", () => {
    it("returns 400 when body fails validation", async () => {
      req.body = { email: "invalid-email" };
      await controller.register(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 201 on successful registration", async () => {
      req.body = {
        full_name: "Test User",
        email: "test@example.com",
        password: "password123",
      };
      mockAuthService.register.mockResolvedValueOnce({
        user: { id: 1, email: "test@example.com" },
        tokens: { access_token: "tok" },
      });
      await controller.register(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(201);
    });

    it("returns 409 when email already exists", async () => {
      req.body = {
        full_name: "Test User",
        email: "test@example.com",
        password: "password123",
      };
      mockAuthService.register.mockRejectedValueOnce(new EmailAlreadyExistsError());
      await controller.register(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(409);
    });

    it("returns 500 when registration throws unexpected error", async () => {
      req.body = {
        full_name: "Test User",
        email: "test@example.com",
        password: "password123",
      };
      mockAuthService.register.mockRejectedValueOnce(new Error("Database crash"));
      await controller.register(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });

  describe("login", () => {
    it("returns 400 when body fails validation", async () => {
      req.body = { email: "not-an-email" };
      await controller.login(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 401 on invalid credentials", async () => {
      req.body = { email: "test@example.com", password: "wrong" };
      mockAuthService.login.mockResolvedValueOnce(null);
      await controller.login(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it("returns 200 on successful login", async () => {
      req.body = { email: "test@example.com", password: "password123" };
      mockAuthService.login.mockResolvedValueOnce({
        user: { id: 1, email: "test@example.com" },
        access_token: "tok",
      });
      await controller.login(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(200);
    });

    it("returns 500 when login throws unexpected error", async () => {
      req.body = { email: "test@example.com", password: "password123" };
      mockAuthService.login.mockRejectedValueOnce(new Error("Redis offline"));
      await controller.login(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });

  describe("acceptShopInvitation", () => {
    it("returns 400 when body fails validation", async () => {
      req.body = { token: "short" };
      await controller.acceptShopInvitation(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 400 when token is expired", async () => {
      req.body = {
        token: "12345678901234567890123456789012",
        password: "securePassword123",
      };
      mockAuthService.checkShopInvitationToken.mockResolvedValueOnce("expired");
      await controller.acceptShopInvitation(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        detail: "Lời mời đã hết hạn. Vui lòng liên hệ quản trị viên.",
      });
    });

    it("returns 400 when token is invalid or used", async () => {
      req.body = {
        token: "12345678901234567890123456789012",
        password: "securePassword123",
      };
      mockAuthService.checkShopInvitationToken.mockResolvedValueOnce("invalid");
      await controller.acceptShopInvitation(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        detail: "Lời mời không hợp lệ hoặc đã được sử dụng.",
      });
    });

    it("returns 201 when invitation is accepted", async () => {
      req.body = {
        token: "12345678901234567890123456789012",
        password: "securePassword123",
      };
      mockAuthService.checkShopInvitationToken.mockResolvedValueOnce("valid");
      mockAuthService.acceptShopInvitation.mockResolvedValueOnce("accepted");
      await controller.acceptShopInvitation(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(201);
    });

    it("returns 409 when email already exists during acceptance", async () => {
      req.body = {
        token: "12345678901234567890123456789012",
        password: "securePassword123",
      };
      mockAuthService.checkShopInvitationToken.mockResolvedValueOnce("valid");
      mockAuthService.acceptShopInvitation.mockResolvedValueOnce("email_exists");
      await controller.acceptShopInvitation(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(409);
    });

    it("returns 400 when acceptance returns expired status", async () => {
      req.body = {
        token: "12345678901234567890123456789012",
        password: "securePassword123",
      };
      mockAuthService.checkShopInvitationToken.mockResolvedValueOnce("valid");
      mockAuthService.acceptShopInvitation.mockResolvedValueOnce("expired");
      await controller.acceptShopInvitation(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 400 when acceptance returns invalid status", async () => {
      req.body = {
        token: "12345678901234567890123456789012",
        password: "securePassword123",
      };
      mockAuthService.checkShopInvitationToken.mockResolvedValueOnce("valid");
      mockAuthService.acceptShopInvitation.mockResolvedValueOnce("invalid");
      await controller.acceptShopInvitation(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 500 when acceptance throws unexpected error", async () => {
      req.body = {
        token: "12345678901234567890123456789012",
        password: "securePassword123",
      };
      mockAuthService.checkShopInvitationToken.mockRejectedValueOnce(new Error("Hashing error"));
      await controller.acceptShopInvitation(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });
});
