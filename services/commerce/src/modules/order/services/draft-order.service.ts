/**
 * Tạo đơn nháp — KHÔNG giữ tồn.
 *
 * Đơn nháp chỉ ghi lại "khách đã chốt, chờ xác nhận". Tồn kho được giữ
 * đúng lúc khách bấm xác nhận (OrderLifecycleService.confirmOrder), nên
 * đơn nháp để bao lâu cũng được và không có job nào quét hết hạn.
 *
 * Hệ quả cố ý: N khách cùng chốt món cuối thì N đơn nháp cùng tồn tại;
 * ai xác nhận trước được hàng, người sau thấy "hết hàng" ngay trên
 * trang xác nhận. Đổi lại, bình luận rác không còn giam được tồn, và
 * khách thật không bị cắt giữa lúc đang gõ địa chỉ.
 *
 * Vẫn đọc tồn khả dụng lúc chốt để bot trả lời khách ngay: mã nào đang
 * hết sạch thì báo luôn thay vì để họ mở link rồi mới biết. Đó chỉ là
 * ảnh chụp tại thời điểm chốt, không phải cam kết.
 *
 * Từ T6, service này GỘP ĐƠN: một khách bình luận nhiều lần trong cùng
 * phiên live chỉ sinh ra MỘT đơn nháp, các lần sau cộng dồn vào đơn đó.
 * Đây là hành vi shop thật sự cần — năm bình luận mà ra năm vận đơn thì
 * khách trả năm lần phí ship và shop gói năm gói.
 */

import type { Pool, PoolClient } from "pg";
import {
  AllLinesOutOfStockError,
  IdempotencyKeyReusedError,
  LivestreamNotOpenError,
  SkuNotFoundError,
} from "../../../shared/errors/domain.errors.js";
import { readSellableQty } from "../repositories/inventory.repository.js";
import {
  appendOutboxEvent,
  fingerprintDraftRequest,
  findIdempotencyRecord,
  findOrderIdByIdempotencyKey,
  findSellableSku,
  loadOrder,
  readLivestreamStatus,
  recordIdempotencyKey,
  upsertOrderItem,
} from "../repositories/order.repository.js";
import { readRiskProfile } from "../repositories/customer-risk.repository.js";
import { getOrCreateOpenDraft } from "./draft-order.resolver.js";
import type {
  DraftOrderResult,
  OrderSource,
  RejectedLine,
} from "../types/order.types.js";

export interface CreateDraftOrderParams {
  customerId: string;
  merchantId: string;
  livestreamId?: string | null;
  source: OrderSource;
  lines: Array<{ skuId: string; quantity: number }>;
}

/** Mã lỗi Postgres cho vi phạm ràng buộc duy nhất. */
const UNIQUE_VIOLATION = "23505";

/** Đơn đã tồn tại từ trước, request này là bản lặp nên không ghi thêm gì. */
const ALREADY_EXISTS = Symbol("already-exists");

export class DraftOrderService {
  constructor(
    private readonly pool: Pool,
    private readonly riskScoreThreshold = 1.1
  ) {}

  async createDraftOrder(
    params: CreateDraftOrderParams,
    idempotencyKey: string
  ): Promise<DraftOrderResult> {
    const client = await this.pool.connect();

    try {
      // ── 1. Phiên live có đang nhận đơn không (ca #22) ────────────
      await this.requireOpenLivestream(client, params.livestreamId ?? null);

      // ── 2. Chống trùng ───────────────────────────────────────────
      // Phải kiểm TRƯỚC khi ghi dòng hàng. Đảo thứ tự thì request lặp
      // sẽ cộng dồn số lượng một lần nữa rồi mới phát hiện trùng.
      const fingerprint = fingerprintDraftRequest({
        customerId: params.customerId,
        merchantId: params.merchantId,
        livestreamId: params.livestreamId ?? null,
        lines: params.lines,
      });

      const replayed = await findIdempotencyRecord(
        client,
        params.customerId,
        idempotencyKey
      );
      if (replayed) {
        // Cùng khoá mà khác nội dung là lỗi phía gọi, không phải lần
        // gửi lại. Trả đơn cũ ở đây sẽ làm bình luận thứ hai IM LẶNG
        // biến mất — khách chốt mà không có đơn, log không ghi gì.
        //
        // requestHash NULL là dòng có từ trước migration 009, không có
        // gì để so nên cho qua.
        if (replayed.requestHash && replayed.requestHash !== fingerprint) {
          throw new IdempotencyKeyReusedError(idempotencyKey);
        }
        return { ...(await loadOrder(client, replayed.orderId)), rejected: [] };
      }

      await client.query("BEGIN");

      // ── 3. BẪY-08: khách có lịch sử bom hàng thì chặn COD ────────
      // Cờ cod_blocked ghi luôn vào đơn để module thanh toán sau này
      // không phải tính lại điểm — tính lại nghĩa là khách có thể qua
      // cửa này mà trượt cửa kia.
      const risk = await readRiskProfile(client, params.customerId);
      const riskyCustomer = risk.riskScore >= this.riskScoreThreshold;

      // ── 4. Lấy đơn để ghi vào: tạo mới hoặc gộp vào đơn đang mở ───
      const target = await this.resolveTargetOrder(
        client,
        params,
        idempotencyKey,
        { codBlocked: riskyCustomer }
      );

      // Request lặp bị phát hiện muộn (xem resolveTargetOrder): trả về
      // đơn đã có, tuyệt đối không cộng dồn thêm.
      if (target === ALREADY_EXISTS) {
        await client.query("ROLLBACK");
        const winner = await findIdempotencyRecord(
          client,
          params.customerId,
          idempotencyKey
        );
        // Cùng kiểm vân tay như nhánh thường, để hai request khác nội
        // dung chạy song song không im lặng nhận chung một đơn.
        if (winner!.requestHash && winner!.requestHash !== fingerprint) {
          throw new IdempotencyKeyReusedError(idempotencyKey);
        }
        return { ...(await loadOrder(client, winner!.orderId)), rejected: [] };
      }

      const { orderId, merged } = target;

      // ── 5. Ghi từng dòng theo tồn khả dụng HIỆN CÓ ───────────────
      // Không giữ, chỉ nhìn. Mã hết sạch thì từ chối ngay để bot trả
      // lời "hết hàng" trong vài giây; còn ít hơn khách muốn thì ghi
      // phần còn lại và đánh dấu isPartial — host ngoài đời cũng nói
      // "còn 3 thôi chị lấy không". Con số thật sự được chốt là lúc
      // khách xác nhận.
      const sortedLines = [...params.lines].sort((a, b) =>
        a.skuId.localeCompare(b.skuId)
      );

      const rejected: RejectedLine[] = [];
      let addedAny = false;

      for (const line of sortedLines) {
        const sku = await findSellableSku(client, line.skuId);
        if (!sku) {
          throw new SkuNotFoundError(line.skuId);
        }

        const ghi = Math.min(line.quantity, await readSellableQty(client, line.skuId));
        if (ghi <= 0) {
          rejected.push({ skuId: line.skuId, requested: line.quantity, sellable: 0 });
          continue;
        }

        // UPSERT: nếu mã này đã có trong đơn (khách chốt lại lần nữa)
        // thì cộng dồn chứ không đẻ dòng mới.
        await upsertOrderItem(client, {
          orderId,
          skuId: line.skuId,
          quantity: ghi,
          requestedQty: line.quantity,
          unitPrice: sku.price,
        });

        addedAny = true;
      }

      // Không ghi được gì thì huỷ sạch. Với đơn mới là để không còn lại
      // đơn rỗng; với đơn gộp thì ROLLBACK chỉ xoá phần vừa thêm, đơn cũ
      // đã commit từ trước nên vẫn nguyên vẹn.
      if (!addedAny) {
        await client.query("ROLLBACK");
        throw new AllLinesOutOfStockError(rejected);
      }

      // ── 6. Ghi nhận khoá chống trùng ─────────────────────────────
      // Nằm trong cùng transaction với phần ghi dòng hàng: nếu ghi hỏng
      // thì khoá cũng biến mất, request được phép thử lại sạch sẽ.
      await recordIdempotencyKey(client, {
        customerId: params.customerId,
        key: idempotencyKey,
        orderId,
        requestHash: fingerprint,
      });

      // ── 7. Sự kiện, cùng transaction ─────────────────────────────
      // Không có inventory.changed ở đây: tồn khả dụng chưa đổi.
      const result = await loadOrder(client, orderId);
      await appendOutboxEvent(client, {
        aggregateId: orderId,
        // Hai loại sự kiện khác nhau vì phía sau xử lý khác nhau: đơn
        // mới thì bot gửi link xác nhận, đơn gộp thì chỉ nhắn "đã thêm
        // vào đơn của bạn" kèm tổng tiền mới.
        eventType: merged ? "order.items_added" : "order.drafted",
        payload: {
          orderId,
          orderCode: result.orderCode,
          customerId: params.customerId,
          livestreamId: params.livestreamId ?? null,
        },
      });

      await client.query("COMMIT");

      return { ...result, rejected };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);

      // Hai request cùng khoá idempotency chạy song song: cả hai vượt
      // qua bước 1, một cái thua ở uq_orders_customer_idempotency.
      // ROLLBACK ở trên xoá sạch phần kẻ thua vừa ghi.
      if (
        typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === UNIQUE_VIOLATION
      ) {
        const existingId = await findOrderIdByIdempotencyKey(
          client,
          params.customerId,
          idempotencyKey
        );
        if (existingId) {
          return { ...(await loadOrder(client, existingId)), rejected: [] };
        }
      }

      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Ca #22 — phiên đã kết thúc thì không nhận đơn.
   *
   * `scheduled` vẫn cho qua: host hay bấm phát trước rồi mới đổi
   * trạng thái, và chặn ở đó sẽ làm mất những đơn đầu phiên.
   */
  private async requireOpenLivestream(
    client: PoolClient,
    livestreamId: string | null
  ): Promise<void> {
    if (!livestreamId) {
      return;
    }

    const status = await readLivestreamStatus(client, livestreamId);
    if (status === null) {
      // Khoá ngoại sẽ bắt ở bước chèn, nhưng báo sớm thì thông điệp
      // rõ hơn nhiều so với lỗi ràng buộc của Postgres.
      throw new LivestreamNotOpenError(livestreamId, "NOT_FOUND");
    }
    if (status !== "live" && status !== "scheduled") {
      throw new LivestreamNotOpenError(livestreamId, status);
    }
  }

  /**
   * Quyết định ghi hàng vào đơn nào.
   *
   * Phần lấy-hoặc-tạo đơn nháp nằm ở `getOrCreateOpenDraft` vì nhánh
   * duyệt đề nghị (T9) cũng dùng chung. Ở đây chỉ thêm phần chống
   * trùng, vốn chỉ có ý nghĩa với đường bình luận.
   */
  private async resolveTargetOrder(
    client: PoolClient,
    params: CreateDraftOrderParams,
    idempotencyKey: string,
    opts: { codBlocked: boolean }
  ): Promise<{ orderId: string; merged: boolean } | typeof ALREADY_EXISTS> {
    const resolved = await getOrCreateOpenDraft(client, {
      customerId: params.customerId,
      merchantId: params.merchantId,
      livestreamId: params.livestreamId ?? null,
      source: params.source,
      idempotencyKey,
      codBlocked: opts.codBlocked,
    });

    if (!resolved.merged) {
      return resolved;
    }

    // Đây là chỗ bịt lỗ cộng dồn hai lần.
    //
    // Hai request CÙNG MỘT khoá chạy song song: cả hai qua được bước 1
    // (lúc đó chưa ai ghi khoá), một cái tạo được đơn, cái kia rơi vào
    // đây. `FOR UPDATE` bên trong getOrCreateOpenDraft đã chặn nó lại
    // cho tới khi kẻ thắng COMMIT, mà kẻ thắng ghi khoá trước khi
    // commit — nên giờ tra lại là thấy. Thiếu bước này, request lặp bị
    // hiểu nhầm thành "bình luận mới" và cộng dồn số lượng thêm một lần.
    const replayed = await findOrderIdByIdempotencyKey(
      client,
      params.customerId,
      idempotencyKey
    );
    if (replayed) {
      return ALREADY_EXISTS;
    }

    return resolved;
  }
}
