/**
 * Job nền: chủ động hỏi hãng khi webhook im tiếng.
 *
 * Webhook là đường chính, job này là lưới an toàn. Lý do phải có:
 *
 *   - Khai sai URL, hoặc đường hầm ngrok đổi địa chỉ sau khi khởi
 *     động lại, là hãng gọi vào hư không.
 *   - Có hãng tự TẮT webhook sau vài lần gọi hỏng liên tiếp.
 *   - Service nằm xuống mười phút là mất đúng mười phút sự kiện, và
 *     phần lớn hãng chỉ thử lại vài lần rồi thôi.
 *
 * Thiếu lưới này thì cả hệ thống phụ thuộc vào việc hãng nhớ gọi
 * mình, và lúc hỏng thì không ai biết cho tới khi khách gọi điện hỏi
 * hàng đâu.
 *
 * Quét theo `last_synced_at` nên vận đơn vừa có tin sẽ không bị hỏi
 * lại — webhook chạy tốt thì job này gần như không làm gì.
 */

import type { Pool, PoolClient } from "pg";
import {
  STATUS_RANK,
  canAdvance,
  getCarrier,
  type ShipmentStatus,
} from "../carriers/index.js";
import {
  adoptOrphan,
  advanceStatus,
  findShipmentById,
  findStuckRequested,
  insertEvent,
  markShipmentRejected,
  touchSynced,
  type VanDon,
} from "../repositories/shipment.repository.js";
import { apDungMocLon } from "../services/apply-shipment-status.js";

export interface SyncShipmentsJobOptions {
  /** Khoảng cách giữa hai lượt quét. Mặc định 2 phút. */
  intervalMs?: number;
  /** Vận đơn im lặng quá ngần này mới hỏi lại. Mặc định 15 phút. */
  staleMinutes?: number;
  /** Kẹt ở REQUESTED quá ngần này thì đi hỏi hãng. Mặc định 5 phút. */
  orphanMinutes?: number;
  /**
   * Hãng không tra cứu được thì sau ngần này phút mới chịu bỏ cuộc.
   *
   * Dài hơn hẳn `orphanMinutes` vì ở đây ta KHÔNG BIẾT hãng có đơn
   * hay không, mà đoán sai thì hoặc bỏ rơi một kiện hàng thật hoặc
   * tạo ra kiện thứ hai. Mặc định 60 phút.
   */
  orphanGiveUpMinutes?: number;
  /** Số vận đơn xử lý tối đa mỗi lượt. */
  batchSize?: number;
}

export interface SyncRunResult {
  scanned: number;
  /** Vận đơn mồ côi tìm lại được mã bên hãng. */
  adopted: number;
  /** Mồ côi đã bỏ cuộc, đánh dấu hỏng để shop tạo lại. */
  abandoned: number;
  /** Có mốc mới được áp vào. */
  updated: number;
  /** Hỏi xong nhưng hãng chưa có tin gì mới. */
  unchanged: number;
  failed: number;
}

/** Trạng thái còn sống, tức còn đáng hỏi lại. */
const CON_SONG = [
  "CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "FAILED",
  "RETURNING",
];

export class SyncShipmentsJob {
  private readonly intervalMs: number;
  private readonly staleMinutes: number;
  private readonly orphanMinutes: number;
  private readonly orphanGiveUpMinutes: number;
  private readonly batchSize: number;

  private timer: NodeJS.Timeout | null = null;
  /** Chặn hai lượt chồng lên nhau khi một lượt chạy lâu hơn interval. */
  private running = false;

  constructor(
    private readonly pool: Pool,
    options: SyncShipmentsJobOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? 120_000;
    this.staleMinutes = options.staleMinutes ?? 15;
    this.orphanMinutes = options.orphanMinutes ?? 5;
    this.orphanGiveUpMinutes = options.orphanGiveUpMinutes ?? 60;
    this.batchSize = options.batchSize ?? 50;
  }

  /**
   * Vận đơn nào đáng hỏi lại.
   *
   * Giãn dần theo TUỔI vận đơn: đơn mới tạo thì tin tức dồn dập nên
   * hỏi dày, đơn đã đi vài ngày thì thưa lại. Không giãn thì một đơn
   * kẹt ở kho trung chuyển cả tuần bị hỏi mấy trăm lần, và hết hạn
   * mức gọi API của hãng.
   */
  private async timVanDonIm(client: PoolClient): Promise<VanDon[]> {
    const r = await client.query<{ id: string }>(
      `SELECT s.id
         FROM shipments s
        WHERE s.status = ANY($1::varchar[])
          AND s.tracking_code IS NOT NULL
          AND s.carrier <> 'self'
          AND (
                s.last_synced_at IS NULL
             -- make_interval(mins => ...) đòi SỐ NGUYÊN, mà phép
             -- nhân với EXTRACT cho ra numeric nên phải ép kiểu.
             OR s.last_synced_at < NOW() - make_interval(
                    mins => (
                        $2::int
                        * GREATEST(1, EXTRACT(DAY FROM NOW() - s.created_at))
                    )::int
                )
          )
        ORDER BY s.last_synced_at NULLS FIRST
        LIMIT $3`,
      [CON_SONG, this.staleMinutes, this.batchSize]
    );

    const ds: VanDon[] = [];
    for (const row of r.rows) {
      const v = await findShipmentById(client, row.id);
      if (v) ds.push(v);
    }
    return ds;
  }

  /**
   * Hỏi hãng rồi bù những mốc còn thiếu.
   *
   * Dùng lại đúng hai lớp phòng thủ của webhook: khoá duy nhất trên
   * `shipment_events` lọc mốc đã có, và phép so thứ hạng chặn đi lùi.
   * Nhờ vậy job này và webhook chạy song song mà không giẫm chân —
   * cùng một mốc về theo hai đường thì chỉ một đường ghi được.
   */
  private async dongBoMot(vanDon: VanDon): Promise<boolean> {
    const carrier = getCarrier(vanDon.carrier);
    if (!carrier.supportsApi || !vanDon.trackingCode) return false;

    const moc = await carrier.getTracking(vanDon.trackingCode);

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      let doiTrangThai = false;
      let hienTai = vanDon.status;

      // Áp theo đúng thứ tự thời gian của hãng, không theo thứ tự
      // hãng trả về trong mảng.
      const theoThoiGian = [...moc].sort(
        (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
      );

      for (const m of theoThoiGian) {
        const moi = await insertEvent(client, {
          shipmentId: vanDon.id,
          eventCode: m.eventCode,
          mappedStatus: m.mappedStatus,
          occurredAt: m.occurredAt,
          description: m.description,
          rawPayload: null,
        });
        if (!moi || !m.mappedStatus) continue;

        if (STATUS_RANK[m.mappedStatus] === STATUS_RANK[hienTai]) continue;
        if (!canAdvance(hienTai, m.mappedStatus)) continue;

        await advanceStatus(client, {
          shipmentId: vanDon.id,
          from: hienTai,
          to: m.mappedStatus,
          occurredAt: m.occurredAt,
          tangLanGiao: hienTai === "FAILED",
        });
        // Chạy ĐÚNG tác dụng phụ mà webhook chạy. Bỏ qua chỗ này
        // thì job bù được trạng thái nhưng quên trừ kho, và lệch đó
        // chỉ lộ ra ở kỳ kiểm kê.
        await apDungMocLon(
          client,
          { ...vanDon, status: hienTai },
          m.mappedStatus,
          m.description
        );

        hienTai = m.mappedStatus as ShipmentStatus;
        doiTrangThai = true;
      }

      // Luôn đánh dấu đã hỏi, kể cả khi không có tin mới. Thiếu bước
      // này thì vận đơn im lặng bị hỏi lại ở MỌI lượt quét.
      await touchSynced(client, vanDon.id);

      await client.query("COMMIT");
      return doiTrangThai;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Dọn vận đơn mồ côi — BẪY-V12.
   *
   * Ba đường ra, và phân biệt chúng là phần quan trọng nhất:
   *
   *   - Hãng CÓ đơn  → nhận nuôi: gắn mã vào, cho sống tiếp.
   *   - Hãng KHÔNG có → đánh dấu hỏng, đơn hàng được giải phóng để
   *     shop tạo lại.
   *   - KHÔNG BIẾT (hãng không có API tra cứu) → chờ lâu hơn hẳn rồi
   *     mới bỏ cuộc, và ghi lý do bắt người kiểm tra bên hãng trước
   *     khi tạo lại. Đoán bừa ở nhánh này thì hoặc bỏ rơi một kiện
   *     hàng thật, hoặc sinh ra kiện thứ hai.
   */
  private async donMoCoi(kq: SyncRunResult): Promise<void> {
    const client = await this.pool.connect();
    let ds: VanDon[];
    try {
      ds = await findStuckRequested(client, this.orphanMinutes, this.batchSize);
    } finally {
      client.release();
    }

    for (const v of ds) {
      try {
        const carrier = getCarrier(v.carrier);

        if (!carrier.findByClientCode) {
          // Không tra cứu được. Chờ đủ lâu rồi mới bỏ, và nói rõ là
          // CHƯA XÁC MINH để người đọc không tưởng hãng đã từ chối.
          const tuoiPhut =
            (Date.now() - new Date(v.createdAt).getTime()) / 60000;
          if (tuoiPhut >= this.orphanGiveUpMinutes) {
            await this.danhDauHong(
              v.id,
              "Không xác minh được bên hãng. Kiểm tra trên trang của hãng " +
                "trước khi tạo lại, tránh đẩy đi hai lần."
            );
            kq.abandoned += 1;
          }
          continue;
        }

        const maHang = await carrier.findByClientCode(v.clientOrderCode);

        if (maHang) {
          const client2 = await this.pool.connect();
          try {
            await client2.query("BEGIN");
            if (await adoptOrphan(client2, v.id, maHang)) {
              await insertEvent(client2, {
                shipmentId: v.id,
                eventCode: "adopted",
                mappedStatus: "CREATED",
                occurredAt: new Date(),
                description:
                  "Tìm lại được vận đơn bên hãng sau khi lần tạo đầu mất kết nối",
                rawPayload: null,
              });
              kq.adopted += 1;
            }
            await client2.query("COMMIT");
          } catch (err) {
            await client2.query("ROLLBACK");
            throw err;
          } finally {
            client2.release();
          }
        } else {
          await this.danhDauHong(
            v.id,
            "Hãng không nhận được yêu cầu tạo đơn. Có thể tạo lại."
          );
          kq.abandoned += 1;
        }
      } catch (err) {
        kq.failed += 1;
        console.error(
          `[SyncShipmentsJob] Không dọn được mồ côi ${v.clientOrderCode}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  private async danhDauHong(shipmentId: string, lyDo: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await markShipmentRejected(client, shipmentId, lyDo);
      await insertEvent(client, {
        shipmentId,
        eventCode: "orphan_abandoned",
        mappedStatus: "REJECTED",
        occurredAt: new Date(),
        description: lyDo,
        rawPayload: null,
      });
    } finally {
      client.release();
    }
  }

  async runOnce(): Promise<SyncRunResult> {
    const kq: SyncRunResult = {
      scanned: 0,
      adopted: 0,
      abandoned: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
    };

    // Dọn mồ côi TRƯỚC: vận đơn vừa được nhận nuôi sẽ sang CREATED và
    // lượt quét ngay bên dưới hỏi luôn hành trình của nó.
    await this.donMoCoi(kq);

    const client = await this.pool.connect();
    let ds: VanDon[];
    try {
      ds = await this.timVanDonIm(client);
    } finally {
      client.release();
    }

    kq.scanned = ds.length;

    for (const v of ds) {
      try {
        if (await this.dongBoMot(v)) kq.updated += 1;
        else kq.unchanged += 1;
      } catch (err) {
        // Một hãng chết không được làm hỏng cả lượt quét: các vận đơn
        // còn lại có thể thuộc hãng khác và vẫn hỏi được.
        kq.failed += 1;
        console.error(
          `[SyncShipmentsJob] Không đồng bộ được ${v.trackingCode}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    return kq;
  }

  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;

      this.runOnce()
        .then((kq) => {
          if (kq.updated || kq.failed || kq.adopted || kq.abandoned) {
            console.log(
              `[SyncShipmentsJob] quét ${kq.scanned}, cập nhật ${kq.updated}, ` +
                `nhận nuôi ${kq.adopted}, bỏ ${kq.abandoned}, hỏng ${kq.failed}`
            );
          }
        })
        .catch((err) => {
          console.error("[SyncShipmentsJob] Lượt quét thất bại:", err);
        })
        .finally(() => {
          this.running = false;
        });
    }, this.intervalMs);

    this.timer.unref?.();

    console.log(
      `[SyncShipmentsJob] Đã bật, quét mỗi ${this.intervalMs / 1000}s, ` +
        `hỏi lại vận đơn im quá ${this.staleMinutes} phút`
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[SyncShipmentsJob] Đã dừng");
    }
  }
}
