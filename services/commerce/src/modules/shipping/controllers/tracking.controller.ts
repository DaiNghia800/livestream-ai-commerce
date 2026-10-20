import type { Request, Response } from "express";
import type { Pool } from "pg";
import { findByTrackingToken } from "../repositories/shipment.repository.js";

/**
 * Trang theo dõi công khai của khách.
 *
 * KHÔNG có đăng nhập: khách bán livestream phần lớn không có tài
 * khoản, bắt đăng ký chỉ để xem hàng tới đâu là mất khách. Thay vào
 * đó, token trong đường dẫn đóng vai trò chìa khoá — cùng một mẫu
 * với link xác nhận đơn.
 *
 * Dữ liệu đã che bớt ngay từ tầng SQL, nên kể cả file này bị sửa sai
 * thì thông tin đầy đủ vẫn không rời khỏi database.
 */
export class TrackingController {
  constructor(private readonly pool: Pool) {}

  get = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      const data = await findByTrackingToken(client, req.params.token);

      // Token sai và token hết hạn đều trả 404 với cùng một câu.
      // Phân biệt hai trường hợp là nói cho người dò biết họ đoán
      // đúng một nửa.
      if (!data) {
        res.status(404).json({ error: "TRACKING_NOT_FOUND" });
        return;
      }

      // Không cho bộ đệm giữ lại: trang này chứa thông tin cá nhân,
      // mà link hay được mở trên máy dùng chung.
      res.setHeader("Cache-Control", "no-store");
      res.json(data);
    } catch (err) {
      console.error("[TrackingController] Lỗi:", err);
      res.status(500).json({ error: "INTERNAL_ERROR" });
    } finally {
      client.release();
    }
  };
}
