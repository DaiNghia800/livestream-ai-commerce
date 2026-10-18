import { describe, it, expect, vi } from "vitest";
import { Request, Response, NextFunction } from "express";
import { createAuthMiddleware } from "../../../src/shared/auth/auth.middleware.js";
import { IAuthRepository } from "../../../src/modules/login/repositories/auth.repository.js";
import { ActiveUser } from "../../../src/modules/login/types/auth.types.js";
import { bearerFor } from "../../helpers/auth.helper.js";

function mockResponse() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

function mockRepository(activeUsers: Map<number, ActiveUser>): IAuthRepository {
  return {
    findActiveUserByEmail: vi.fn(),
    findActiveUserById: vi.fn(async (id: number) => activeUsers.get(id) ?? null),
    registerWithSession: vi.fn(),
    createSession: vi.fn(),
  };
}

describe("auth.middleware unit tests", () => {
  const userMap = new Map<number, ActiveUser>([
    [
      1,
      {
        id: 1,
        email: "customer@test.com",
        fullName: "Customer",
        role: "customer",
        isActive: true,
      },
    ],
    [
      2,
      {
        id: 2,
        email: "owner@test.com",
        fullName: "Shop Owner",
        role: "shop_owner",
        isActive: true,
      },
    ],
  ]);

  const repo = mockRepository(userMap);
  const { authenticate, optionalAuthenticate, requireRole } = createAuthMiddleware(repo);

  describe("authenticate", () => {
    it("rejects request without Authorization header with 401", async () => {
      const req = { headers: {} } as Request;
      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      await authenticate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects request with invalid token with 401", async () => {
      const req = { headers: { authorization: "Bearer invalid.token.value" } } as Request;
      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      await authenticate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects request if user does not exist in repo with 401", async () => {
      const req = {
        headers: { authorization: bearerFor({ userId: 999, role: "shop_owner" }) },
      } as Request;
      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      await authenticate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("passes and sets req.auth when token is valid and user is active", async () => {
      const req = {
        headers: { authorization: bearerFor({ userId: 2, role: "shop_owner" }) },
      } as Request;
      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      await authenticate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.auth).toEqual({ userId: 2, role: "shop_owner" });
    });
  });

  describe("optionalAuthenticate", () => {
    it("passes through as anonymous when no header is present", async () => {
      const req = { headers: {} } as Request;
      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      await optionalAuthenticate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.auth).toBeUndefined();
    });

    it("populates req.auth when header is valid", async () => {
      const req = {
        headers: { authorization: bearerFor({ userId: 1, role: "customer" }) },
      } as Request;
      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      await optionalAuthenticate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.auth).toEqual({ userId: 1, role: "customer" });
    });

    it("returns 401 when header is present but token is invalid (does not silently ignore)", async () => {
      const req = {
        headers: { authorization: "Bearer invalid.token.signature" },
      } as Request;
      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      await optionalAuthenticate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("requireRole", () => {
    it("returns 401 if req.auth is missing", () => {
      const req = {} as Request;
      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      const guard = requireRole("shop_owner");
      guard(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 403 if user role is not in allowed roles", () => {
      const req = {
        auth: { userId: 1, role: "customer" },
      } as unknown as Request;
      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      const guard = requireRole("shop_owner", "admin");
      guard(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("calls next if user role is in allowed roles", () => {
      const req = {
        auth: { userId: 2, role: "shop_owner" },
      } as unknown as Request;
      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      const guard = requireRole("shop_owner", "admin");
      guard(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
