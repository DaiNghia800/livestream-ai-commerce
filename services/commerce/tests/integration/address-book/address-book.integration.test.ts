/**
 * Sổ địa chỉ của tài khoản.
 *
 * Thứ được giữ chặt nhất ở đây là RANH GIỚI: địa chỉ của người này,
 * người kia có đoán đúng id cũng không xem, không sửa, không xoá
 * được — và câu trả lời phải giống hệt "không có", để không tiết lộ
 * id đó tồn tại.
 */

import crypto from "crypto";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { config } from "../../../src/config.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = createApp();

afterAll(async () => {
  await pool.end();
});

/** Đăng ký một tài khoản thật trên Postgres rồi lấy token. */
async function dangNhap(): Promise<string> {
  const email = `khach-${crypto.randomUUID()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ full_name: "Lê Trần Tiến", email, password: "mat-khau-123" });
  expect(res.status).toBe(201);
  return res.body.access_token as string;
}

const DIA_CHI = {
  recipientName: "Lê Trần Tiến",
  recipientPhone: "0989541246",
  provinceName: "Khánh Hòa",
  // Sau 01/07/2025 các phường trung tâm Nha Trang gộp thành "Phường
  // Nha Trang" trong danh mục hai cấp chính thức — "Lộc Thọ" chỉ còn
  // trong danh mục ba cấp của hãng. Mã thật lấy qua API trong từng ca.
  wardCode: "22366",
  streetLine: "88 Trần Phú",
};

async function maPhuong(province: string, ten: RegExp): Promise<string> {
  const res = await request(app).get(
    `/api/shipments/wards-current?province=${encodeURIComponent(province)}`
  );
  const phuong = (res.body.items as Array<{ code: string; name: string }>).find(
    (w) => ten.test(w.name)
  );
  expect(phuong, `không thấy phường khớp ${ten}`).toBeDefined();
  return phuong!.code;
}

describe("Sổ địa chỉ", () => {
  it("không đăng nhập thì 401, kể cả chỉ xem", async () => {
    expect((await request(app).get("/api/me/addresses")).status).toBe(401);
  });

  it("địa chỉ ĐẦU TIÊN tự thành mặc định", async () => {
    // Khách lưu một cái rồi vào màn xác nhận thấy ô trống là họ
    // tưởng chưa lưu.
    const token = await dangNhap();
    const wardCode = await maPhuong("Khánh Hòa", /^Phường Nha Trang$/);

    const res = await request(app)
      .post("/api/me/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...DIA_CHI, wardCode });

    expect(res.status).toBe(201);
    expect(res.body.isDefault).toBe(true);
    expect(res.body.wardName).toBe("Phường Nha Trang");
  });

  it("chỉ MỘT mặc định: đặt cái mới thì cái cũ mất cờ", async () => {
    const token = await dangNhap();
    const wardCode = await maPhuong("Khánh Hòa", /^Phường Nha Trang$/);
    const h = { Authorization: `Bearer ${token}` };

    const a = await request(app).post("/api/me/addresses").set(h).send({ ...DIA_CHI, wardCode });
    const b = await request(app).post("/api/me/addresses").set(h)
      .send({ ...DIA_CHI, wardCode, streetLine: "90 Trần Phú" });
    expect(b.body.isDefault).toBe(false);

    const dat = await request(app).post(`/api/me/addresses/${b.body.id}/default`).set(h);
    expect(dat.status).toBe(200);

    const ds = dat.body.items as Array<{ id: string; isDefault: boolean }>;
    expect(ds.filter((x) => x.isDefault)).toHaveLength(1);
    expect(ds.find((x) => x.id === b.body.id)?.isDefault).toBe(true);
    expect(ds.find((x) => x.id === a.body.id)?.isDefault).toBe(false);
    // Mặc định luôn đứng đầu danh sách.
    expect(ds[0].id).toBe(b.body.id);
  });

  it("xoá cái mặc định thì đôn cái mới nhất còn lại lên", async () => {
    const token = await dangNhap();
    const wardCode = await maPhuong("Khánh Hòa", /^Phường Nha Trang$/);
    const h = { Authorization: `Bearer ${token}` };

    const a = await request(app).post("/api/me/addresses").set(h).send({ ...DIA_CHI, wardCode });
    const b = await request(app).post("/api/me/addresses").set(h)
      .send({ ...DIA_CHI, wardCode, streetLine: "90 Trần Phú" });

    expect((await request(app).delete(`/api/me/addresses/${a.body.id}`).set(h)).status).toBe(204);

    const ds = (await request(app).get("/api/me/addresses").set(h)).body.items;
    expect(ds).toHaveLength(1);
    expect(ds[0].id).toBe(b.body.id);
    expect(ds[0].isDefault).toBe(true);
  });

  it("phường không thuộc tỉnh đã chọn thì 400 ngay lúc lưu", async () => {
    // Lưu một địa chỉ hãng không tra ra thì đơn chỉ hỏng muộn hơn —
    // lúc shop bấm tạo vận đơn.
    const token = await dangNhap();
    const phuongHaNoi = await maPhuong("Hà Nội", /./);

    const res = await request(app)
      .post("/api/me/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...DIA_CHI, provinceName: "Khánh Hòa", wardCode: phuongHaNoi });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/không thuộc tỉnh/);
  });

  it("tỉnh ngoài danh mục 34 đơn vị thì 400", async () => {
    const token = await dangNhap();
    const res = await request(app)
      .post("/api/me/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...DIA_CHI, provinceName: "Nha Trang" });
    expect(res.status).toBe(400);
  });

  it("KHÔNG xem, sửa, xoá được địa chỉ của người khác — và trả 404 như không có", async () => {
    const tokenA = await dangNhap();
    const tokenB = await dangNhap();
    const wardCode = await maPhuong("Khánh Hòa", /^Phường Nha Trang$/);

    const cuaA = await request(app)
      .post("/api/me/addresses")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ ...DIA_CHI, wardCode });
    const id = cuaA.body.id as string;
    const hB = { Authorization: `Bearer ${tokenB}` };

    expect((await request(app).get("/api/me/addresses").set(hB)).body.items).toHaveLength(0);
    expect(
      (await request(app).patch(`/api/me/addresses/${id}`).set(hB).send({ ...DIA_CHI, wardCode })).status
    ).toBe(404);
    expect((await request(app).delete(`/api/me/addresses/${id}`).set(hB)).status).toBe(404);
    expect((await request(app).post(`/api/me/addresses/${id}/default`).set(hB)).status).toBe(404);

    // Của A vẫn nguyên.
    const conA = (await request(app).get("/api/me/addresses").set({ Authorization: `Bearer ${tokenA}` })).body.items;
    expect(conA).toHaveLength(1);
  });

  it("quá trần 20 địa chỉ thì 409", async () => {
    const token = await dangNhap();
    const wardCode = await maPhuong("Khánh Hòa", /^Phường Nha Trang$/);
    const h = { Authorization: `Bearer ${token}` };

    for (let i = 0; i < 20; i += 1) {
      const r = await request(app).post("/api/me/addresses").set(h)
        .send({ ...DIA_CHI, wardCode, streetLine: `${i + 1} Trần Phú` });
      expect(r.status).toBe(201);
    }
    const thu21 = await request(app).post("/api/me/addresses").set(h)
      .send({ ...DIA_CHI, wardCode, streetLine: "21 Trần Phú" });
    expect(thu21.status).toBe(409);
  });

  it("nhãn Nhà riêng / Văn phòng lưu được và bỏ trống cũng được", async () => {
    const token = await dangNhap();
    const wardCode = await maPhuong("Khánh Hòa", /^Phường Nha Trang$/);
    const h = { Authorization: `Bearer ${token}` };

    const nha = await request(app).post("/api/me/addresses").set(h)
      .send({ ...DIA_CHI, wardCode, label: "HOME" });
    expect(nha.status).toBe(201);
    expect(nha.body.label).toBe("HOME");

    const trong = await request(app).post("/api/me/addresses").set(h)
      .send({ ...DIA_CHI, wardCode, streetLine: "90 Trần Phú" });
    expect(trong.body.label).toBeNull();

    const sua = await request(app).patch(`/api/me/addresses/${trong.body.id}`).set(h)
      .send({ ...DIA_CHI, wardCode, streetLine: "90 Trần Phú", label: "OFFICE" });
    expect(sua.body.label).toBe("OFFICE");

    const la = await request(app).post("/api/me/addresses").set(h)
      .send({ ...DIA_CHI, wardCode, label: "SCHOOL" });
    expect(la.status).toBe(400);
  });

  it("trường lạ bị từ chối thay vì âm thầm bỏ qua", async () => {
    const token = await dangNhap();
    const wardCode = await maPhuong("Khánh Hòa", /^Phường Nha Trang$/);
    const res = await request(app)
      .post("/api/me/addresses")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...DIA_CHI, wardCode, userId: 1 });
    expect(res.status).toBe(400);
  });
});
