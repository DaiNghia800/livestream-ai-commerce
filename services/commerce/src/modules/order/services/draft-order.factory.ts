/**
 * Dựng DraftOrderService với đầy đủ ngưỡng từ config.
 *
 * Có ba nơi cần dựng service này (route đơn hàng, route hàng đợi
 * duyệt, job nền). Lặp danh sách tham số ba lần thì thêm một ngưỡng
 * mới là phải sửa ba chỗ, và chỗ bị quên sẽ chạy với giá trị mặc định
 * — tức là guard im lặng ngừng hoạt động ở đúng nhánh đó.
 */

import type { Pool } from "pg";
import { config } from "../../../config.js";
import { DraftOrderService } from "./draft-order.service.js";

export function createDraftOrderService(pool: Pool): DraftOrderService {
  return new DraftOrderService(
    pool,
    config.holdSoftSeconds,
    config.holdMaxSeconds,
    config.riskScoreThreshold,
    config.holdRiskySeconds
  );
}
