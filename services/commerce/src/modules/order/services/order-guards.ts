/**
 * Guard nghiệp vụ — T11.
 *
 * Mười hai bẫy ở README mục 7. File này gom bốn bẫy thuộc về backend
 * đơn hàng; bốn bẫy khác (BẪY-02 ghim chồng lấn, BẪY-03 bình luận của
 * shop, BẪY-04 bình luận bị sửa) nằm ở tầng đọc bình luận của AI
 * worker, phải chặn TRƯỚC khi gọi sang đây.
 *
 * Mỗi guard trả về một quyết định kèm lý do đọc được, chứ không ném
 * lỗi: nhân viên nhìn hàng đợi phải biết vì sao đề nghị này rơi vào
 * đây, nếu không họ sẽ duyệt bừa.
 */

import type { PoolClient } from "pg";
import { config } from "../../../config.js";
import {
  readHeldQtyInSession,
  readRiskProfile,
} from "../repositories/customer-risk.repository.js";

export type GuardReason =
  /** BẪY-05: một dòng xin quá nhiều. Vẫn giữ tồn. */
  | "QTY_ABOVE_THRESHOLD"
  /** BẪY-01: khách đã giữ quá nhiều trong phiên. KHÔNG giữ thêm. */
  | "SESSION_HOLD_CAP"
  /** BẪY-08: khách có lịch sử bom hàng. */
  | "HIGH_RISK_CUSTOMER";

export interface GuardVerdict {
  /** Có được phép tự chốt đơn không, hay phải qua tay người. */
  autoOrderAllowed: boolean;
  /** Khi phải review: có giữ tồn trong lúc chờ không. */
  holdWhileReviewing: boolean;
  /** Lý do để hiện trên màn hình hàng đợi. Rỗng nghĩa là không vướng gì. */
  reasons: GuardReason[];
  /** TTL áp cho lần giữ này. Rút ngắn với khách rủi ro cao. */
  holdSeconds: number;
  /** Ghi vào orders.cod_blocked để module thanh toán tôn trọng. */
  codBlocked: boolean;
  riskScore: number;
}

export interface GuardInput {
  customerId: string;
  livestreamId: string | null;
  lines: Array<{ skuId: string; quantity: number }>;
}

/**
 * Chạy toàn bộ guard trước khi quyết định nhánh xử lý.
 *
 * Thứ tự KHÔNG quan trọng vì các lý do cộng dồn, nhưng việc "có giữ
 * tồn hay không" thì quan trọng: chỉ cần MỘT guard nói không giữ là
 * không giữ. BẪY-01 nhằm chặn troll khoá kho nên nó thắng BẪY-05 vốn
 * chỉ muốn giữ chân khách sỉ.
 */
export async function evaluateGuards(
  client: PoolClient,
  input: GuardInput
): Promise<GuardVerdict> {
  const reasons: GuardReason[] = [];
  let holdWhileReviewing = true;

  // ── BẪY-05: số lượng vô lý ───────────────────────────────────────
  // "cho e 100 cái" có thể là gõ nhầm, cũng có thể là khách sỉ thật.
  // Để người thật quyết, nhưng VẪN giữ tồn — từ chối thẳng là mất đơn
  // to nhất phiên.
  const quantityTooBig = input.lines.some(
    (line) => line.quantity > config.reviewQtyThreshold
  );
  if (quantityTooBig) {
    reasons.push("QTY_ABOVE_THRESHOLD");
  }

  // ── BẪY-01: một account khoá sạch kho ────────────────────────────
  // Troll bình luận 50 lần, hoặc một bug retry phía client, đủ để giam
  // hết mã hot và làm cả phiên đứng hình. Ở đây rủi ro là phá phiên
  // chứ không phải mất một đơn, nên KHÔNG giữ thêm.
  //
  // Chỉ kiểm được khi có phiên: ngoài phiên live thì không có ranh
  // giới nào để tính "đã giữ bao nhiêu".
  if (input.livestreamId) {
    const dangGiu = await readHeldQtyInSession(client, {
      customerId: input.customerId,
      livestreamId: input.livestreamId,
    });
    const themVao = input.lines.reduce((sum, line) => sum + line.quantity, 0);

    if (dangGiu + themVao > config.maxHeldPerCustomerPerSession) {
      reasons.push("SESSION_HOLD_CAP");
      holdWhileReviewing = false;
    }
  }

  // ── BẪY-08: bom hàng ─────────────────────────────────────────────
  const risk = await readRiskProfile(client, input.customerId);
  const riskyCustomer = risk.riskScore >= config.riskScoreThreshold;
  if (riskyCustomer) {
    reasons.push("HIGH_RISK_CUSTOMER");
  }

  return {
    autoOrderAllowed: reasons.length === 0,
    holdWhileReviewing,
    reasons,
    // Khách đã bỏ đơn ba lần không đáng được giam tồn đủ 5 phút như
    // khách mua thật.
    holdSeconds: riskyCustomer
      ? config.holdRiskySeconds
      : config.holdSoftSeconds,
    codBlocked: riskyCustomer,
    riskScore: risk.riskScore,
  };
}
