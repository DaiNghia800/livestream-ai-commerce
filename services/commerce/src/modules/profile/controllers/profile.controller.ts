/**
 * HTTP cho hồ sơ cá nhân. Đứng sau `authenticate()`, nên `req.auth`
 * chắc chắn có.
 */

import type { Pool } from "pg";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { findProfile, updateProfile } from "../repositories/profile.repository.js";
import { ProfileUpdateSchema } from "../schemas/profile.schema.js";

export class ProfileController {
  constructor(private readonly pool: Pool) {}

  /** GET /me/profile */
  get = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      const hoSo = await findProfile(client, req.auth!.userId);
      if (!hoSo) {
        res.status(404).json({ error: "ProfileNotFound", message: "Không tìm thấy tài khoản." });
        return;
      }
      res.json(hoSo);
    } catch (err) {
      this.loi(err, res);
    } finally {
      client.release();
    }
  };

  /** PATCH /me/profile */
  update = async (req: Request, res: Response): Promise<void> => {
    let input;
    try {
      input = ProfileUpdateSchema.parse(req.body);
    } catch (err) {
      this.loi(err, res);
      return;
    }

    const client = await this.pool.connect();
    try {
      const hoSo = await updateProfile(client, req.auth!.userId, {
        fullName: input.fullName,
        phone: input.phone ?? null,
      });
      if (!hoSo) {
        res.status(404).json({ error: "ProfileNotFound", message: "Không tìm thấy tài khoản." });
        return;
      }
      res.json(hoSo);
    } catch (err) {
      this.loi(err, res);
    } finally {
      client.release();
    }
  };

  private loi(err: unknown, res: Response): void {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: "BadRequest",
        message: err.issues.map((i) => i.message).join("; "),
      });
      return;
    }
    console.error("[ProfileController]", err);
    res.status(500).json({ error: "InternalServerError", message: "Lỗi hệ thống." });
  }
}
