import { Router } from "express";
import { IAuthRepository, PostgresAuthRepository } from "../repositories/auth.repository.js";
import { AdminUserController } from "../controllers/admin-user.controller.js";
import { authenticate, requireRole } from "../../../shared/auth/auth.middleware.js";

export function createAdminUserRouter(
  customRepository?: IAuthRepository
): Router {
  const router = Router();
  const repository = customRepository ?? new PostgresAuthRepository();
  const controller = new AdminUserController(repository);

  // Current user's own permissions can be fetched by any authenticated staff/admin
  router.get("/me/permissions", authenticate(repository), controller.getMyPermissions);

  // Management endpoints require admin role
  router.use(authenticate(repository), requireRole("admin"));
  router.get("/users", controller.list);
  router.patch("/users/:userId", controller.update);
  router.get("/permissions", controller.listPermissions);
  router.get("/roles", controller.listRoles);
  router.post("/roles", controller.createRole);
  router.put("/roles/:roleId/permissions", controller.updateRolePermissions);
  router.get("/shop-invitations", controller.listInvitations);
  router.post("/shop-invitations", controller.createInvitation);
  router.post(
    "/shop-invitations/:invitationId/rotate",
    controller.rotateInvitation
  );
  router.post(
    "/shop-invitations/:invitationId/revoke",
    controller.revokeInvitation
  );

  return router;
}
