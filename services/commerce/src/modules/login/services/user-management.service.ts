import { IAuthRepository } from "../repositories/auth.repository.js";
import {
  ManagedUsersQuery,
  UpdateManagedUser,
} from "../schemas/auth.schema.js";
import { ManagedUser } from "../types/auth.types.js";

export class CannotModifySelfError extends Error {
  constructor() {
    super("Không thể tự đổi vai trò hoặc trạng thái tài khoản của mình");
    this.name = "CannotModifySelfError";
  }
}

export class UserManagementService {
  constructor(private readonly repository: IAuthRepository) {}

  list(query: ManagedUsersQuery) {
    return this.repository.listManagedUsers(query.limit, query.offset);
  }

  update(
    targetUserId: number,
    actingUserId: number,
    input: UpdateManagedUser
  ): Promise<ManagedUser | null> {
    if (targetUserId === actingUserId) {
      throw new CannotModifySelfError();
    }
    return this.repository.updateManagedUser(targetUserId, {
      role: input.role,
      isActive: input.is_active,
    });
  }
}
