import type { Request, Response } from "express";
import { ZodError } from "zod";
import { DomainError } from "../../../shared/errors/domain.errors.js";
import { TINH_THANH, traTinh } from "../address/vietnam-provinces.js";
import { moPhongDuocBat } from "../services/simulate-carrier.service.js";
import { getCarrier, GhnCarrier } from "../carriers/index.js";
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
  SimulateSchema,
} from "../schemas/shipment.schema.js";
import type { ShipmentService } from "../services/shipment.service.js";
import { listCurrentWards } from "../address/current-wards.js";

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
  INVALID_SIMULATION_STEP: 400,
  ADDRESS_NOT_NORMALIZED: 422,
  COD_NOT_ALLOWED: 422,
  GHN_HEAVY_SHIPMENT_NOT_SUPPORTED: 422,
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

  /**
   * GET /shipments/provinces — 34 tỉnh/thành hiện hành.
   *
   * Phơi ra để form sửa địa chỉ dùng chung MỘT danh mục với bộ kiểm
   * tra phía sau. Chép danh sách này sang frontend thì tới lúc hành
   * chính đổi lần nữa, hai bên lệch nhau và shop chọn được một tỉnh
   * mà API từ chối.
   */
  provinces = async (_req: Request, res: Response): Promise<void> => {
    res.json({ items: TINH_THANH });
  };

  /** Current two-level wards for the customer confirmation form. */
  currentWards = async (req: Request, res: Response): Promise<void> => {
    const provinceName = String(req.query.province ?? "");
    if (!TINH_THANH.includes(provinceName as (typeof TINH_THANH)[number])) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Vui lòng chọn tỉnh/thành trong danh mục hiện hành.",
      });
      return;
    }
    res.json({ items: listCurrentWards(provinceName) });
  };

  /**
   * GET /shipments/districts?province=… và /shipments/wards?…
   *
   * Danh mục cho màn CHỌN địa chỉ, lấy từ GHN. Chọn GHN làm nguồn vì
   * danh mục của họ đầy đủ nhất và là thứ ta buộc phải khớp khi tạo
   * đơn; các hãng khác tự dò theo tên nên vẫn dùng được.
   *
   * Chưa khai khoá GHN thì trả danh sách RỖNG chứ không báo lỗi —
   * màn hình tự lùi về ô gõ tay. Chặn người dùng nhập địa chỉ chỉ vì
   * thiếu một khoá API là phản ứng quá tay.
   */
  places = async (req: Request, res: Response): Promise<void> => {
    const tinh = String(req.query.province ?? "");
    const kq = traTinh(tinh);
    if (!kq.tinh) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: `"${tinh}" không nằm trong danh mục 34 tỉnh/thành hiện hành.`,
      });
      return;
    }

    let hang: GhnCarrier;
    try {
      hang = getCarrier("ghn") as GhnCarrier;
    } catch {
      res.json({ items: [], reason: "CARRIER_NOT_CONFIGURED" });
      return;
    }

    try {
      const huyen = req.query.district ? String(req.query.district) : null;
      const items = huyen
        ? await hang.listWards(kq.tinh, huyen)
        : await hang.listDistricts(kq.tinh);
      res.json({ items });
    } catch (err) {
      // Hãng hỏng thì cũng lùi về gõ tay, đừng khoá người dùng lại.
      console.error("[ShipmentController] Không tra được danh mục:", err);
      res.json({ items: [], reason: "CARRIER_UNAVAILABLE" });
    }
  };

  /**
   * POST /shipments/:id/simulate — đóng vai hãng bắn một mốc về.
   *
   * Gói tin đi qua ĐÚNG service xử lý webhook thật, nên vẫn chịu đủ
   * ba lớp: xác thực nguồn, chống trùng, chặn lùi trạng thái. Ở đây
   * chỉ dựng và ký gói tin, không có nhánh nào đi tắt.
   */
  simulate = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!moPhongDuocBat()) {
        res.status(403).json({
          error: "SIMULATION_DISABLED",
          message: "Giả lập hãng bị tắt ở môi trường này.",
        });
        return;
      }

      const input = SimulateSchema.parse(req.body);
      res.json(await this.service.simulateCarrierEvent(req.params.id, input.code));
    } catch (err) {
      this.xuLyLoi(err, res, "giả lập mốc vận đơn");
    }
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
