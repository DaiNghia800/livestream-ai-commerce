import { createHash, randomBytes } from "node:crypto";
import { Request, Response } from "express";
import { ZodError } from "zod";
import {
  IAuthRepository,
  LastActiveAdminError,
  ShopInvitationEmailAlreadyRegisteredError,
} from "../repositories/auth.repository.js";
import {
  CreateShopInvitationSchema,
  ManagedUsersQuerySchema,
  ShopInvitationsQuerySchema,
  UpdateManagedUserSchema,
} from "../schemas/auth.schema.js";
import {
  CannotModifySelfError,
  UserManagementService,
} from "../services/user-management.service.js";

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function respondWithValidationError(res: Response, error: ZodError): void {
  res.status(400).json({
    error: "BadRequest",
    message: error.issues.map((issue) => issue.message).join("; "),
  });
}

export class AdminUserController {
  constructor(private readonly repository: IAuthRepository) {
    this.userManagement = new UserManagementService(repository);
  }

  private readonly userManagement: UserManagementService;

  list = async (req: Request, res: Response): Promise<void> => {
    const parsed = ManagedUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      respondWithValidationError(res, parsed.error);
      return;
    }
    try {
      const result = await this.userManagement.list(parsed.data);
      res.status(200).json({
        ...result,
        currentUserId: req.auth!.userId,
      });
    } catch (error) {
      console.error("[AdminUserController] User listing failed:", error);
      res.status(500).json({
        error: "InternalServerError",
        message: "Không thể tải danh sách người dùng",
      });
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.userId);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({
        error: "BadRequest",
        message: "Mã người dùng không hợp lệ",
      });
      return;
    }

    const parsed = UpdateManagedUserSchema.safeParse(req.body);
    if (!parsed.success) {
      respondWithValidationError(res, parsed.error);
      return;
    }

    try {
      const updated = await this.userManagement.update(
        id,
        req.auth!.userId,
        parsed.data
      );
      if (!updated) {
        res.status(404).json({
          error: "NotFound",
          message: "Không tìm thấy người dùng",
        });
        return;
      }
      res.status(200).json({ user: updated });
    } catch (error) {
      if (error instanceof LastActiveAdminError) {
        res.status(409).json({
          error: "Conflict",
          message: error.message,
        });
        return;
      }
      if (error instanceof CannotModifySelfError) {
        res.status(409).json({
          error: "Conflict",
          message: error.message,
        });
        return;
      }
      console.error("[AdminUserController] User update failed:", error);
      res.status(500).json({
        error: "InternalServerError",
        message: "Không thể cập nhật người dùng",
      });
    }
  };

  listInvitations = async (req: Request, res: Response): Promise<void> => {
    const parsed = ShopInvitationsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      respondWithValidationError(res, parsed.error);
      return;
    }
    try {
      res.status(200).json(
        await this.repository.listShopInvitations(
          parsed.data.limit,
          parsed.data.offset
        )
      );
    } catch (error) {
      console.error("[AdminUserController] Shop invitation listing failed:", error);
      res.status(500).json({
        error: "InternalServerError",
        message: "Không thể tải danh sách lời mời",
      });
    }
  };

  createInvitation = async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateShopInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      respondWithValidationError(res, parsed.error);
      return;
    }
    const token = randomBytes(32).toString("base64url");
    try {
      const invitation = await this.repository.createShopInvitation({
        email: parsed.data.email.toLowerCase(),
        fullName: parsed.data.full_name,
        shopName: parsed.data.shop_name,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
        createdBy: req.auth!.userId,
      });
      res.status(201).json({ invitation, token });
    } catch (error) {
      if (error instanceof ShopInvitationEmailAlreadyRegisteredError) {
        res.status(409).json({
          error: "Conflict",
          message: "Email này đã được đăng ký. Hãy dùng email khác.",
        });
        return;
      }
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      ) {
        res.status(409).json({
          error: "Conflict",
          message: "Email này đã có lời mời đang chờ xử lý",
        });
        return;
      }
      console.error("[AdminUserController] Shop invitation creation failed:", error);
      res.status(500).json({
        error: "InternalServerError",
        message: "Không thể tạo lời mời shop",
      });
    }
  };

  rotateInvitation = async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.invitationId);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({
        error: "BadRequest",
        message: "Mã lời mời không hợp lệ",
      });
      return;
    }
    const token = randomBytes(32).toString("base64url");
    try {
      const invitation = await this.repository.rotateShopInvitation(
        id,
        createHash("sha256").update(token).digest("hex"),
        new Date(Date.now() + INVITATION_LIFETIME_MS)
      );
      if (!invitation) {
        res.status(404).json({
          error: "NotFound",
          message: "Không tìm thấy lời mời có thể tạo lại",
        });
        return;
      }
      res.status(200).json({ invitation, token });
    } catch (error) {
      console.error("[AdminUserController] Shop invitation rotation failed:", error);
      res.status(500).json({
        error: "InternalServerError",
        message: "Không thể tạo lại lời mời shop",
      });
    }
  };

  revokeInvitation = async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.invitationId);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({
        error: "BadRequest",
        message: "Mã lời mời không hợp lệ",
      });
      return;
    }
    try {
      const invitation = await this.repository.revokeShopInvitation(id);
      if (!invitation) {
        res.status(404).json({
          error: "NotFound",
          message: "Không tìm thấy lời mời đang chờ xử lý",
        });
        return;
      }
      res.status(200).json({ invitation });
    } catch (error) {
      console.error("[AdminUserController] Shop invitation revocation failed:", error);
      res.status(500).json({
        error: "InternalServerError",
        message: "Không thể thu hồi lời mời shop",
      });
    }
  };
}
