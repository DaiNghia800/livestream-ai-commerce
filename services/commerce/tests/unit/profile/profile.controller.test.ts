import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { ProfileController } from "../../../src/modules/profile/controllers/profile.controller.js";
import * as profileRepo from "../../../src/modules/profile/repositories/profile.repository.js";

describe("ProfileController Unit Tests", () => {
  let controller: ProfileController;
  let mockPool: any;
  let mockClient: any;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockClient = {
      release: vi.fn(),
    };
    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    };
    controller = new ProfileController(mockPool);

    statusMock = vi.fn().mockReturnThis();
    jsonMock = vi.fn().mockReturnThis();
    req = {
      auth: { userId: 10, role: "customer", merchantId: "m-1" },
      body: {},
    };
    res = {
      status: statusMock,
      json: jsonMock,
    };
  });

  describe("get", () => {
    it("returns 200 with profile data", async () => {
      vi.spyOn(profileRepo, "findProfile").mockResolvedValueOnce({
        id: 10,
        email: "user@test.com",
        fullName: "Test User",
        phone: "0901234567",
        role: "customer",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await controller.get(req as Request, res as Response);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 10, fullName: "Test User" })
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("returns 404 when profile is not found", async () => {
      vi.spyOn(profileRepo, "findProfile").mockResolvedValueOnce(null);

      await controller.get(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("returns 500 when database fails", async () => {
      vi.spyOn(profileRepo, "findProfile").mockRejectedValueOnce(new Error("DB error"));

      await controller.get(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("returns 400 when input validation fails", async () => {
      req.body = { fullName: "A" }; // min 2 chars
      await controller.update(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 200 on successful update", async () => {
      req.body = { fullName: "New Name", phone: "0987654321" };
      vi.spyOn(profileRepo, "updateProfile").mockResolvedValueOnce({
        id: 10,
        email: "user@test.com",
        fullName: "New Name",
        phone: "0987654321",
        role: "customer",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await controller.update(req as Request, res as Response);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: "New Name" })
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("returns 404 when user is not found to update", async () => {
      req.body = { fullName: "New Name" };
      vi.spyOn(profileRepo, "updateProfile").mockResolvedValueOnce(null);

      await controller.update(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("returns 500 when update fails unexpectedly", async () => {
      req.body = { fullName: "New Name" };
      vi.spyOn(profileRepo, "updateProfile").mockRejectedValueOnce(new Error("DB write crash"));

      await controller.update(req as Request, res as Response);
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
