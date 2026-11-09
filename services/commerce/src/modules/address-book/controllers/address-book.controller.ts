/**
 * HTTP cho sổ địa chỉ. Mọi handler đều đứng sau `authenticate()`,
 * nên `req.auth` chắc chắn có — không có thì middleware đã trả 401.
 */

import type { Request, Response } from "express";
import { ZodError } from "zod";
import { AddressInputSchema } from "../schemas/address-book.schema.js";
import {
  AddressBookService,
  AddressLimitError,
  AddressNotFoundError,
} from "../services/address-book.service.js";

export class AddressBookController {
  constructor(private readonly service: AddressBookService) {}

  /** GET /me/addresses */
  list = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json({ items: await this.service.list(req.auth!.userId) });
    } catch (err) {
      this.loi(err, res);
    }
  };

  /** POST /me/addresses */
  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = AddressInputSchema.parse(req.body);
      res.status(201).json(await this.service.create(req.auth!.userId, input));
    } catch (err) {
      this.loi(err, res);
    }
  };

  /** PATCH /me/addresses/:id */
  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = AddressInputSchema.parse(req.body);
      res.json(await this.service.update(req.auth!.userId, req.params.id, input));
    } catch (err) {
      this.loi(err, res);
    }
  };

  /** DELETE /me/addresses/:id */
  remove = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.service.remove(req.auth!.userId, req.params.id);
      res.status(204).end();
    } catch (err) {
      this.loi(err, res);
    }
  };

  /** POST /me/addresses/:id/default */
  setDefault = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.service.setDefault(req.auth!.userId, req.params.id);
      res.json({ items: await this.service.list(req.auth!.userId) });
    } catch (err) {
      this.loi(err, res);
    }
  };

  /**
   * Cùng một hình dạng lỗi cho cả module, để giao diện chỉ viết một
   * nhánh bắt lỗi. 404 cho "không phải của bạn" cũng như "không có":
   * nói khác đi là tiết lộ id đó tồn tại.
   */
  private loi(err: unknown, res: Response): void {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: "BadRequest",
        message: err.issues.map((i) => i.message).join("; "),
      });
      return;
    }
    if (err instanceof AddressNotFoundError) {
      res.status(404).json({ error: "AddressNotFound", message: err.message });
      return;
    }
    if (err instanceof AddressLimitError) {
      res.status(409).json({ error: "AddressLimit", message: err.message });
      return;
    }
    console.error("[AddressBookController]", err);
    res.status(500).json({ error: "InternalServerError", message: "Lỗi hệ thống." });
  }
}
