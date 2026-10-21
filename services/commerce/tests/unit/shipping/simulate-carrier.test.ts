/**
 * Bộ dựng gói tin giả lập.
 *
 * Gói tin phải giống gói tin THẬT tới mức đi lọt qua chính bộ đọc
 * webhook của hãng. Sai một trường là ta tự tay viết một ca test
 * xanh cho một luồng không bao giờ chạy ngoài đời.
 *
 * Hai chỗ dễ sai nhất, và đều từng sai thật:
 *
 *   - Goship đặt mã vận đơn ở `id`, còn `code` của họ là MÃ HTTP.
 *   - Mã đối soát COD phải ỔN ĐỊNH giữa các lần gửi, nếu không bấm
 *     hai lần là tiền vào sổ hai lần.
 */

import { describe, expect, it } from "vitest";
import {
  CHANG_GIA_LAP,
  dungGoiTin,
  headerXacThuc,
  moPhongDuocBat,
} from "../../../src/modules/shipping/services/simulate-carrier.service.js";
import { GoshipCarrier } from "../../../src/modules/shipping/carriers/index.js";

const VAN_DON = {
  carrier: "goship",
  trackingCode: "GS8KKMOYV8",
  clientOrderCode: "LIVE-20261019-abc123",
  codAmount: "250000",
};

describe("Dựng gói tin giả lập", () => {
  it("Goship: mã vận đơn ở `id`, KHÔNG phải ở `code`", () => {
    // `code` của Goship là mã HTTP. Đặt mã vận đơn vào đó thì bộ đọc
    // webhook đi tìm vận đơn mang mã "200" và không bao giờ thấy.
    const goi = dungGoiTin(VAN_DON, "903");

    expect(goi.id).toBe("GS8KKMOYV8");
    expect(goi.code).toBe(200);
    expect(goi.status).toBe(903);
  });

  it("Goship: chỉ mốc 911 mới kèm số tiền COD", () => {
    expect(dungGoiTin(VAN_DON, "903").cod).toBeUndefined();
    expect(dungGoiTin(VAN_DON, "911").cod).toBe(250000);
  });

  it("GHN: gói tin COD vẫn mang trạng thái giao, `Type` mới phân biệt", () => {
    // Gộp hai thứ làm một là ghi nhận doanh thu lúc khách ký nhận,
    // trong khi tiền còn nằm ở hãng cả tuần.
    const ghn = { ...VAN_DON, carrier: "ghn", trackingCode: "L8MDMR" };

    const giao = dungGoiTin(ghn, "delivered");
    expect(giao.Type).toBe("delivered");
    expect(giao.CODAmount).toBeUndefined();

    const tien = dungGoiTin(ghn, "cod");
    expect(tien.Type).toBe("cod");
    expect(tien.Status).toBe("delivered");
    expect(tien.CODAmount).toBe(250000);
  });

  it("GHN: ngày chuyển COD CỐ ĐỊNH theo vận đơn, không theo đồng hồ", () => {
    // Ngày này tham gia mã đối soát. Lấy theo lúc bấm thì bấm hai
    // lần sinh hai mã, chống trùng vô tác dụng, tiền cộng hai lần.
    const ghn = { ...VAN_DON, carrier: "ghn", trackingCode: "L8MDMR" };

    expect(dungGoiTin(ghn, "cod").CODTransferDate).toBe(
      dungGoiTin(ghn, "cod").CODTransferDate
    );
  });

  it("chữ ký Goship qua được chính bộ đọc webhook của họ", () => {
    // Phép kiểm thật sự: gói tin ta dựng phải lọt qua parseWebhook
    // chứ không chỉ "trông giống".
    const cfg = {
      username: "u",
      password: "p",
      clientId: "id",
      clientSecret: "secret-gia",
      baseUrl: "https://sandbox.goship.io/api/v2",
      webhookSecret: "bi-mat-gia",
      fromName: "Kho",
      fromPhone: "0900000000",
      fromStreet: "1 Lê Lợi",
      fromProvince: "Hồ Chí Minh",
      fromDistrict: "Quận 1",
      fromWard: "Phường Bến Thành",
    };
    const hang = new GoshipCarrier(cfg);
    const than = JSON.stringify(dungGoiTin(VAN_DON, "903"));

    const sk = hang.parseWebhook(JSON.parse(than), {
      "x-goship-hmac-sha256": hang.signWebhook(than),
    }, than);

    expect(sk.trackingCode).toBe("GS8KKMOYV8");
    expect(sk.mappedStatus).toBe("PICKED_UP");
  });

  it("GHN xác thực bằng header bí mật, Goship bằng chữ ký", () => {
    expect(Object.keys(headerXacThuc("ghn", "{}"))).toEqual([
      "x-webhook-secret",
    ]);
    expect(Object.keys(headerXacThuc("goship", "{}"))).toEqual([
      "x-goship-hmac-sha256",
    ]);
  });

  it("chỉ hai hãng nhận webhook mới có hành trình giả lập", () => {
    // "self" đã có nút bấm tay riêng, "mock" tự chạy trong máy. Thêm
    // chúng vào đây là tạo ra hai đường làm cùng một việc.
    expect(Object.keys(CHANG_GIA_LAP).sort()).toEqual(["ghn", "goship"]);
  });

  it("mốc cuối của Goship là 905, KHÔNG phải 906", () => {
    // 906 là GIAO THẤT BẠI. Nhầm hai mã này là demo chạy xong báo
    // giao hỏng mà vẫn tưởng thành công.
    const ma = CHANG_GIA_LAP.goship.map((c) => c.code);
    expect(ma).toContain("905");
    expect(CHANG_GIA_LAP.goship.find((c) => c.code === "906")?.label).toMatch(
      /thất bại/
    );
  });

  it("bật ở môi trường thử, TẮT ở production", () => {
    // Một công cụ dựng được mốc "đã giao" mà chạy trên máy thật là
    // công cụ dựng được doanh thu giả.
    const cu = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      expect(moPhongDuocBat()).toBe(false);
      process.env.NODE_ENV = "test";
      expect(moPhongDuocBat()).toBe(true);
    } finally {
      process.env.NODE_ENV = cu;
    }
  });
});
