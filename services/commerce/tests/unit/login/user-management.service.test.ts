import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  UserManagementService,
  CannotModifySelfError,
} from "../../../src/modules/login/services/user-management.service.js";
import type { IAuthRepository } from "../../../src/modules/login/repositories/auth.repository.js";

describe("UserManagementService Unit Tests", () => {
  let mockRepo: {
    listManagedUsers: ReturnType<typeof vi.fn>;
    updateManagedUser: ReturnType<typeof vi.fn>;
  };
  let service: UserManagementService;

  beforeEach(() => {
    mockRepo = {
      listManagedUsers: vi.fn(),
      updateManagedUser: vi.fn(),
    };
    service = new UserManagementService(mockRepo as unknown as IAuthRepository);
  });

  describe("list", () => {
    it("calls repository.listManagedUsers with limit and offset", async () => {
      const mockResult = { users: [], total: 0 };
      mockRepo.listManagedUsers.mockResolvedValueOnce(mockResult);

      const result = await service.list({ limit: 20, offset: 10 });
      expect(mockRepo.listManagedUsers).toHaveBeenCalledWith(20, 10);
      expect(result).toBe(mockResult);
    });
  });

  describe("update", () => {
    it("throws CannotModifySelfError when targetUserId equals actingUserId", () => {
      expect(() =>
        service.update(1, 1, { role: "admin" })
      ).toThrow(CannotModifySelfError);
      expect(mockRepo.updateManagedUser).not.toHaveBeenCalled();
    });

    it("calls repository.updateManagedUser and returns updated user", async () => {
      const mockUser = { id: 2, email: "u2@test.com", role: "customer", is_active: true };
      mockRepo.updateManagedUser.mockResolvedValueOnce(mockUser);

      const result = await service.update(2, 1, { role: "customer", is_active: true });
      expect(mockRepo.updateManagedUser).toHaveBeenCalledWith(2, {
        role: "customer",
        isActive: true,
      });
      expect(result).toEqual(mockUser);
    });
  });
});
