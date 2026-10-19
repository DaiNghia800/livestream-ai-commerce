import type { Request, Response } from "express";
import { ZodError } from "zod";
import { DomainError } from "../../../shared/errors/domain.errors.js";
import {
  CarrierNotConfiguredError,
  CarrierRejectedError,
  UnknownCarrierError,
  availableCarriers,
} from "../carriers/index.js";
import {
  CreateShipmentSchema,
  ListShipmentsSchema,
  ManualStatusSchema,
} from "../schemas/shipment.schema.js";
import type { ShipmentService } from "../services/shipment.service.js";

/**
 * Bảng tra mã lỗi nghiệp vụ sang mã HTTP.
 *
 * Để ở một chỗ thay vì rải `if` trong từng hàm: thêm lỗi mới mà quên
 * khai ở đây thì nó rơi về 500, và 500 là thứ khiến người vận hành
 * không biết phải sửa gì.
 */
const MA_HTTP: Record<string, number> = {
  SHIPMENT_NOT_FOUND: 404,
  ORDER_NOT_READY: 409,
  SHIPMENT_ALREADY_EXISTS: 409,
  CANNOT_CANCEL_SHIPMENT: 409,
  INVALID_MANUAL_SHIPMENT_STATUS: 409,
  ADDRESS_NOT_NORMALIZED: 422,
  COD_NOT_ALLOWED: 422,
};

export class ShipmentController {
  constructor(private readonly service: ShipmentService) {}

  /** POST /shipments — tạo vận đơn và đẩy sang hãng. */
  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = CreateShipmentSchema.parse(req.body);
      const vanDon = await this.service.createShipment({
        orderId: input.orderId,
        carrier: input.carrier,
        serviceCode: input.serviceCode,
        weightGram: input.weightGram,
        lengthCm: input.lengthCm,
        widthCm: input.widthCm,
        heightCm: input.heightCm,
        insuranceValue: input.insuranceValue,
        note: input.note,
      });
      res.status(vanDon.status === "REQUESTED" ? 202 : 201).json(vanDon);
    } catch (err) {
      this.xuLyLoi(err, res, "tạo vận đơn");
    }
  };

  /** GET /shipments — danh sách cho màn quản lý vận chuyển. */
  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const f = ListShipmentsSchema.parse(req.query);
      res.json({ items: await this.service.listForMerchant(f) });
    } catch (err) {
      this.xuLyLoi(err, res, "đọc danh sách vận đơn");
    }
  };

  /** GET /shipments/:id — chi tiết kèm nhật ký lộ trình. */
  detail = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await this.service.getShipmentDetail(req.params.id));
    } catch (err) {
      this.xuLyLoi(err, res, "đọc chi tiết vận đơn");
    }
  };

  /** POST /shipments/:id/cancel */
  cancel = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await this.service.cancelShipment(req.params.id));
    } catch (err) {
      this.xuLyLoi(err, res, "huỷ vận đơn");
    }
  };

  /** POST /shipments/:id/status — shop bấm tay, dùng cho đơn tự giao. */
  pushStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = ManualStatusSchema.parse(req.body);
      res.json(
        await this.service.pushManualStatus(
          req.params.id,
          input.status,
          input.description
        )
      );
    } catch (err) {
      this.xuLyLoi(err, res, "cập nhật trạng thái vận đơn");
    }
  };

  /**
   * GET /shipments/carriers — hãng nào đang bấm được.
   *
   * Màn tạo vận đơn chỉ hiện những lựa chọn thật sự dùng được. Hiện
   * ra rồi báo lỗi lúc bấm là cách nhanh nhất làm người dùng mất tin.
   */
  carriers = async (_req: Request, res: Response): Promise<void> => {
    res.json({ items: availableCarriers() });
  };

  private xuLyLoi(err: unknown, res: Response, viec: string): void {
    if (err instanceof ZodError) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: err.issues });
      return;
    }

    if (err instanceof DomainError) {
      res
        .status(MA_HTTP[err.code] ?? 400)
        .json({ error: err.code, message: err.message });
      return;
    }

    // Chưa khai khoá KHÔNG phải sự cố hệ thống: shop chưa đăng ký tài
    // khoản thử ở hãng đó. Nói rõ thiếu biến môi trường nào.
    if (err instanceof CarrierNotConfiguredError) {
      res.status(503).json({
        error: "CARRIER_NOT_CONFIGURED",
        carrier: err.carrier,
        missing: err.missing,
        message: err.message,
      });
      return;
    }

    if (err instanceof UnknownCarrierError) {
      res.status(400).json({ error: "UNKNOWN_CARRIER", message: err.message });
      return;
    }

    // Hãng từ chối là lỗi phía họ, không phải lỗi của ta. Trả 502 và
    // giữ nguyên văn lý do để shop biết phải sửa gì.
    if (err instanceof CarrierRejectedError) {
      res.status(502).json({
        error: "CARRIER_REJECTED",
        carrier: err.carrier,
        reason: err.reason,
      });
      return;
    }

    console.error(`[ShipmentController] Lỗi khi ${viec}:`, err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}
