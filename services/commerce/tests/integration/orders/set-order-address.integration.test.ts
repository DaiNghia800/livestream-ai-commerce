/**
 * Shop sửa tay địa chỉ giao.
 *
 * Bộ tách tự động chỉ đúng được phần lớn: khách gõ tên thành phố
 * thay cho tỉnh, quên phường, hoặc viết tên tỉnh đã sáp nhập. Trước
 * khi có endpoint này, cảnh báo "địa chỉ chưa chuẩn hoá" là một ngõ
 * cụt — shop đọc xong không có chỗ nào để sửa, mà đơn thì không đẩy
 * sang hãng được.
 *
 * Ba thứ được giữ ở đây, và cả ba đều là quyết định nghiệp vụ:
 *
 *   - Tên tỉnh lưu xuống là tên trong DANH MỤC, không phải chuỗi
 *     người dùng gõ. Hãng tra theo danh mục của họ.
 *   - Có vận đơn còn sống thì KHÔNG cho sửa. Nhãn đã in rồi.
 *   - Cột chuỗi cũ `orders.shipping_address` phải khớp với bản đã
 *     tách, không được để hai nơi nói hai chuyện.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";
import { createSkuWithStock } from "../../helpers/catalog.helper.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();

afterAll(async () => {
  await pool.end();
});

const DIA_CHI_DUNG = {
  recipientName: "Trần Minh Khoa",
  recipientPhone: "0903551708",
  provinceName: "Khánh Hòa",
  wardName: "Phường Lộc Thọ",
  streetLine: "88 Trần Phú",
};

/**
 * Dựng một đơn đã CONFIRMED với địa chỉ KHÔNG tách được.
 *
 * Cố tình dùng "Nha Trang": sau 01/07/2025 đây không còn là đơn vị
 * hành chính nào, nên đơn rơi đúng vào trạng thái cần sửa tay.
 */
async function donChuaChuanHoa() {
  const sku = await createSkuWithStock(pool, 10);
  const draft = await request(app)
    .post("/api/orders/draft")
    .set("Idempotency-Key", crypto.randomUUID())
    .send({
      customerId: crypto.randomUUID(),
      merchantId: crypto.randomUUID(),
      source: "COMMENT_AI",
      lines: [{ skuId: sku, quantity: 1 }],
    });
  expect(draft.status).toBe(201);

  const xacNhan = await request(app)
    .post(`/api/orders/confirm/${draft.body.confirmToken}`)
    .send({
      recipientName: "Trần Minh Khoa",
      recipientPhone: "0903551708",
      shippingAddress: "88 Trần Phú, phường Lộc Thọ, Nha Trang",
    });
  expect(xacNhan.status).toBe(200);
  expect(xacNhan.body.addressNormalized).toBe(false);

  return draft.body.id as string;
}

async function docDiaChi(orderId: string) {
  const r = await pool.query(
    `SELECT a.province_name, a.district_name, a.ward_name, a.street_line,
            a.is_new_format, (a.normalized_at IS NOT NULL) AS da_chuan,
            o.shipping_address
       FROM orders o LEFT JOIN addresses a ON a.id = o.address_id
      WHERE o.id = $1`,
    [orderId]
  );
  return r.rows[0];
}

describe("Sửa tay địa chỉ giao", () => {
  it("đơn chưa có địa chỉ tách được thì sửa xong là dùng được ngay", async () => {
    const orderId = await donChuaChuanHoa();

    // Trước khi sửa: chỉ có chuỗi tự do, chưa có bản ghi địa chỉ.
    expect((await docDiaChi(orderId)).province_name).toBeNull();

    const res = await request(app)
      .post(`/api/orders/${orderId}/address`)
      .send(DIA_CHI_DUNG);

    expect(res.status).toBe(200);
    expect(res.body.addressNormalized).toBe(true);

    const sau = await docDiaChi(orderId);
    expect(sau.province_name).toBe("Khánh Hòa");
    expect(sau.ward_name).toBe("Phường Lộc Thọ");
    expect(sau.da_chuan).toBe(true);
    // Không khai quận/huyện = địa chỉ hai cấp sau sáp nhập.
    expect(sau.district_name).toBeNull();
    expect(sau.is_new_format).toBe(true);
  });

  it("lưu tên tỉnh theo DANH MỤC, không theo cách người dùng gõ", async () => {
    // Hãng tra danh mục của chính họ. Lưu "khanh hoa" không dấu thì
    // đơn chỉ hỏng muộn hơn, lúc bấm tạo vận đơn.
    const orderId = await donChuaChuanHoa();

    const res = await request(app)
      .post(`/api/orders/${orderId}/address`)
      .send({ ...DIA_CHI_DUNG, provinceName: "  tp khanh hoa  " });

    expect(res.status).toBe(200);
    expect((await docDiaChi(orderId)).province_name).toBe("Khánh Hòa");
  });

  it("cột chuỗi cũ được dựng lại cho khớp, không để lệch", async () => {
    // Để lệch thì màn đơn hàng hiện địa chỉ cũ còn hãng nhận địa chỉ
    // mới, và không ai biết bên nào đúng.
    const orderId = await donChuaChuanHoa();

    await request(app).post(`/api/orders/${orderId}/address`).send(DIA_CHI_DUNG);

    expect((await docDiaChi(orderId)).shipping_address).toBe(
      "88 Trần Phú, Phường Lộc Thọ, Khánh Hòa"
    );
  });

  it("giữ quận/huyện khi shop khai, và đánh dấu là địa chỉ ba cấp", async () => {
    const orderId = await donChuaChuanHoa();

    const res = await request(app)
      .post(`/api/orders/${orderId}/address`)
      .send({ ...DIA_CHI_DUNG, districtName: "Thành phố Nha Trang" });

    expect(res.status).toBe(200);
    const sau = await docDiaChi(orderId);
    expect(sau.district_name).toBe("Thành phố Nha Trang");
    expect(sau.is_new_format).toBe(false);
  });

  it("sửa hai lần thì ghi đè, KHÔNG đẻ thêm bản ghi địa chỉ", async () => {
    // Chèn dòng mới mỗi lần sửa để lại dòng cũ mồ côi, và rác tích
    // lại theo từng lần shop sửa.
    const orderId = await donChuaChuanHoa();

    await request(app).post(`/api/orders/${orderId}/address`).send(DIA_CHI_DUNG);
    const lan1 = await pool.query(`SELECT address_id FROM orders WHERE id = $1`, [
      orderId,
    ]);

    await request(app)
      .post(`/api/orders/${orderId}/address`)
      .send({ ...DIA_CHI_DUNG, streetLine: "90 Trần Phú" });
    const lan2 = await pool.query(`SELECT address_id FROM orders WHERE id = $1`, [
      orderId,
    ]);

    expect(lan2.rows[0].address_id).toBe(lan1.rows[0].address_id);
    expect((await docDiaChi(orderId)).street_line).toBe("90 Trần Phú");
  });

  it("tỉnh đã sáp nhập bị từ chối, kèm gợi ý tên mới", async () => {
    const orderId = await donChuaChuanHoa();

    const res = await request(app)
      .post(`/api/orders/${orderId}/address`)
      .send({ ...DIA_CHI_DUNG, provinceName: "Bình Dương" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/TP\. Hồ Chí Minh/);
  });

  it("tên thành phố thuộc tỉnh bị từ chối, kèm gợi ý tỉnh", async () => {
    // Đây là tình huống hay gặp nhất: khách gõ tên thành phố mình ở.
    const orderId = await donChuaChuanHoa();

    const res = await request(app)
      .post(`/api/orders/${orderId}/address`)
      .send({ ...DIA_CHI_DUNG, provinceName: "Nha Trang" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Khánh Hòa/);
  });

  it("tỉnh hoàn toàn lạ bị từ chối, và KHÔNG bịa ra gợi ý", async () => {
    const orderId = await donChuaChuanHoa();

    const res = await request(app)
      .post(`/api/orders/${orderId}/address`)
      .send({ ...DIA_CHI_DUNG, provinceName: "Tỉnh Không Có Thật" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/34 tỉnh\/thành/);
    expect(res.body.message).not.toMatch(/Có phải bạn muốn/);
  });

  it("thiếu phường/xã hoặc số nhà thì từ chối", async () => {
    const orderId = await donChuaChuanHoa();

    for (const thieu of [{ wardName: "" }, { streetLine: "x" }]) {
      const res = await request(app)
        .post(`/api/orders/${orderId}/address`)
        .send({ ...DIA_CHI_DUNG, ...thieu });
      expect(res.status).toBe(400);
    }
  });

  it("đọc địa chỉ từ bảng addresses khi cột cũ còn rỗng", async () => {
    // Đơn do script demo tạo chỉ ghi bảng `addresses`, không ghi cột
    // cũ. Màn hình chỉ đọc cột cũ sẽ hiện "Chưa có" trong khi kiện
    // hàng đang trên đường tới một địa chỉ có thật — shop nhìn vào
    // sẽ trả lời sai cho khách.
    const orderId = await donChuaChuanHoa();
    await request(app).post(`/api/orders/${orderId}/address`).send(DIA_CHI_DUNG);

    // Xoá trắng cột cũ, giữ nguyên bảng mới.
    await pool.query(
      `UPDATE orders
          SET recipient_name = NULL, recipient_phone = NULL,
              shipping_address = NULL
        WHERE id = $1`,
      [orderId]
    );

    const r = await pool.query<{ order_code: string }>(
      `SELECT order_code FROM orders WHERE id = $1`,
      [orderId]
    );
    const res = await request(app).get(
      `/api/orders/by-code/${r.rows[0].order_code}`
    );

    expect(res.status).toBe(200);
    expect(res.body.recipientName).toBe("Trần Minh Khoa");
    expect(res.body.recipientPhone).toBe("0903551708");
    expect(res.body.shippingAddress).toBe(
      "88 Trần Phú, Phường Lộc Thọ, Khánh Hòa"
    );
    expect(res.body.addressNormalized).toBe(true);
  });

  it("đơn không tồn tại thì 404", async () => {
    const res = await request(app)
      .post(`/api/orders/${crypto.randomUUID()}/address`)
      .send(DIA_CHI_DUNG);

    expect(res.status).toBe(404);
  });

  it("đơn đã huỷ thì KHÔNG cho sửa", async () => {
    // Địa chỉ của đơn đã kết thúc là dữ liệu lịch sử; sửa vào chỉ
    // làm sai chứng từ của một việc đã xong.
    const orderId = await donChuaChuanHoa();
    await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .send({ reason: "CUSTOMER_CANCEL" });

    const res = await request(app)
      .post(`/api/orders/${orderId}/address`)
      .send(DIA_CHI_DUNG);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("InvalidOrderState");
  });

  it("đã có vận đơn còn sống thì KHÔNG cho sửa", async () => {
    // Kiện hàng đang trong tay hãng với địa chỉ cũ in trên nhãn. Đổi
    // trong database không đổi được cái nhãn, chỉ khiến hệ thống và
    // thực tế nói hai chuyện khác nhau.
    const orderId = await donChuaChuanHoa();
    await request(app).post(`/api/orders/${orderId}/address`).send(DIA_CHI_DUNG);

    const tao = await request(app)
      .post("/api/shipments")
      .send({ orderId, carrier: "mock", weightGram: 600 });
    expect(tao.status).toBe(201);

    const res = await request(app)
      .post(`/api/orders/${orderId}/address`)
      .send({ ...DIA_CHI_DUNG, streetLine: "99 Trần Phú" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/huỷ vận đơn trước/);
  });

  it("vận đơn ĐÃ HUỶ thì sửa lại được", async () => {
    // Huỷ xong là kiện hàng không còn ở hãng nữa, địa chỉ lại thuộc
    // quyền shop. Chặn luôn ở đây là bắt shop tạo đơn mới chỉ vì gõ
    // sai một chữ.
    const orderId = await donChuaChuanHoa();
    await request(app).post(`/api/orders/${orderId}/address`).send(DIA_CHI_DUNG);

    const tao = await request(app)
      .post("/api/shipments")
      .send({ orderId, carrier: "mock", weightGram: 600 });
    expect(tao.status).toBe(201);
    const huy = await request(app)
      .post(`/api/shipments/${tao.body.id}/cancel`)
      .send({});
    expect(huy.status).toBe(200);

    const res = await request(app)
      .post(`/api/orders/${orderId}/address`)
      .send({ ...DIA_CHI_DUNG, streetLine: "99 Trần Phú" });

    expect(res.status).toBe(200);
    expect((await docDiaChi(orderId)).street_line).toBe("99 Trần Phú");
  });

  it("trường lạ bị từ chối thay vì âm thầm bỏ qua", async () => {
    const orderId = await donChuaChuanHoa();

    const res = await request(app)
      .post(`/api/orders/${orderId}/address`)
      .send({ ...DIA_CHI_DUNG, normalizedAt: "2020-01-01" });

    expect(res.status).toBe(400);
  });
});
