import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { AdminUserController } from "../../../src/modules/login/controllers/admin-user.controller.js";
import {
  LastActiveAdminError,
  ShopInvitationEmailAlreadyRegisteredError,
} from "../../../src/modules/login/repositories/auth.repository.js";
import { CannotModifySelfError } from "../../../src/modules/login/services/user-management.service.js";

describe("AdminUserController Unit Tests", () => {
  let mockRepo: any;
  let controller: AdminUserController;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: any;
  let statusMock: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    res = {
      status: statusMock,
      json: jsonMock,
    };
    req = {
      query: {},
      params: {},
      body: {},
      auth: { userId: 1, role: "admin", merchantId: "m-1" },
    };

    mockRepo = {
      listManagedUsers: vi.fn(),
      updateManagedUser: vi.fn(),
      createShopInvitation: vi.fn(),
      listShopInvitations: vi.fn(),
      revokeShopInvitation: vi.fn(),
    };

    controller = new AdminUserController(mockRepo);
  });

  describe("list", () => {
    it("returns 400 on invalid query params", async () => {
      req.query = { limit: "invalid-number" };
      await controller.list(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 200 with users list", async () => {
      req.query = { limit: "10", offset: "0" };
      mockRepo.listManagedUsers.mockResolvedValueOnce({
        users: [{ id: 1, email: "admin@test.com", role: "admin" }],
        total: 1,
      });

      await controller.list(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 1,
          currentUserId: 1,
        })
      );
    });

    it("returns 500 when repository fails", async () => {
      req.query = { limit: "10", offset: "0" };
      mockRepo.listManagedUsers.mockRejectedValueOnce(new Error("DB error"));

      await controller.list(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });

  describe("update", () => {
    it("returns 400 on invalid userId param", async () => {
      req.params = { userId: "abc" };
      await controller.update(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 400 on invalid body", async () => {
      req.params = { userId: "2" };
      req.body = { role: "invalid-role" };
      await controller.update(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 404 when user not found", async () => {
      req.params = { userId: "99" };
      req.body = { role: "shop_owner" };
      mockRepo.updateManagedUser.mockResolvedValueOnce(null);

      await controller.update(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(404);
    });

    it("returns 409 on LastActiveAdminError", async () => {
      req.params = { userId: "2" };
      req.body = { role: "customer" };
      mockRepo.updateManagedUser.mockRejectedValueOnce(new LastActiveAdminError());

      await controller.update(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(409);
    });

    it("returns 409 on CannotModifySelfError", async () => {
      req.params = { userId: "1" }; // same as auth.userId
      req.body = { role: "shop_owner" };

      await controller.update(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(409);
    });

    it("returns 200 on successful update", async () => {
      req.params = { userId: "2" };
      req.body = { role: "shop_owner", is_active: true };
      const updatedUser = { id: 2, email: "user2@test.com", role: "shop_owner", is_active: true };
      mockRepo.updateManagedUser.mockResolvedValueOnce(updatedUser);

      await controller.update(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ user: updatedUser });
    });
  });

  describe("createInvitation", () => {
    it("returns 400 on invalid email or missing fields", async () => {
      req.body = { email: "not-an-email" };
      await controller.createInvitation(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 409 when email is already registered", async () => {
      req.body = {
        email: "taken@test.com",
        full_name: "Nguyen Van A",
        shop_name: "Chic Shop",
      };
      mockRepo.createShopInvitation.mockRejectedValueOnce(
        new ShopInvitationEmailAlreadyRegisteredError()
      );

      await controller.createInvitation(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(409);
    });

    it("returns 201 on successful invitation creation", async () => {
      req.body = {
        email: "new@test.com",
        full_name: "Le Thi B",
        shop_name: "Fashion House",
      };
      mockRepo.createShopInvitation.mockResolvedValueOnce({
        id: 10,
        email: "new@test.com",
        fullName: "Le Thi B",
        shopName: "Fashion House",
        tokenHash: "abc",
        expiresAt: new Date(),
      });

      await controller.createInvitation(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          token: expect.any(String),
        })
      );
    });
  });

  describe("listInvitations", () => {
    it("returns 400 on invalid query params", async () => {
      req.query = { limit: "-5" };
      await controller.listInvitations(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 200 with invitation list", async () => {
      req.query = { limit: "10", offset: "0" };
      mockRepo.listShopInvitations.mockResolvedValueOnce({
        invitations: [{ id: 1, email: "invited@test.com" }],
        total: 1,
      });

      await controller.listInvitations(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(200);
    });
  });

  describe("revokeInvitation", () => {
    it("returns 400 on invalid invitationId", async () => {
      req.params = { invitationId: "0" };
      await controller.revokeInvitation(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 404 when invitation not found", async () => {
      req.params = { invitationId: "123" };
      mockRepo.revokeShopInvitation.mockResolvedValueOnce(null);

      await controller.revokeInvitation(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(404);
    });

    it("returns 200 on successful revocation", async () => {
      req.params = { invitationId: "123" };
      mockRepo.revokeShopInvitation.mockResolvedValueOnce({
        id: 123,
        status: "revoked",
      });

      await controller.revokeInvitation(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(200);
    });
  });
});
