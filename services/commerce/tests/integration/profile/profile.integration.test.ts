/**
 * Hồ sơ cá nhân: xem và sửa họ tên, số điện thoại của chính mình.
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

async function dangKy(): Promise<{ token: string; email: string }> {
  const email = `khach-${crypto.randomUUID()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ full_name: "Lê Trần Tiến", email, password: "mat-khau-123" });
  expect(res.status).toBe(201);
  return { token: res.body.access_token as string, email };
}

describe("Hồ sơ cá nhân", () => {
  it("không đăng nhập thì 401", async () => {
    expect((await request(app).get("/api/me/profile")).status).toBe(401);
    expect((await request(app).patch("/api/me/profile").send({ fullName: "A B" })).status).toBe(401);
  });

  it("xem hồ sơ: có tên, email, số điện thoại (ban đầu trống), không lộ mật khẩu", async () => {
    const { token, email } = await dangKy();
    const res = await request(app)
      .get("/api/me/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fullName: "Lê Trần Tiến", email, phone: null, role: "customer" });
    expect(res.body).not.toHaveProperty("passwordHash");
    expect(res.body).not.toHaveProperty("password_hash");
  });

  it("sửa họ tên và số điện thoại", async () => {
    const { token } = await dangKy();
    const res = await request(app)
      .patch("/api/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Tiến Lê", phone: "0989541246" });

    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("Tiến Lê");
    expect(res.body.phone).toBe("0989541246");

    const lai = await request(app).get("/api/me/profile").set("Authorization", `Bearer ${token}`);
    expect(lai.body.phone).toBe("0989541246");
  });

  it("xoá số điện thoại bằng chuỗi rỗng", async () => {
    const { token } = await dangKy();
    const h = { Authorization: `Bearer ${token}` };
    await request(app).patch("/api/me/profile").set(h).send({ fullName: "Tiến Lê", phone: "0989541246" });
    const res = await request(app).patch("/api/me/profile").set(h).send({ fullName: "Tiến Lê", phone: "" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBeNull();
  });

  it("số điện thoại sai định dạng thì 400", async () => {
    const { token } = await dangKy();
    const res = await request(app)
      .patch("/api/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Tiến Lê", phone: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Số điện thoại/);
  });

  it("KHÔNG cho đổi email hay vai trò qua đường này", async () => {
    const { token, email } = await dangKy();
    const res = await request(app)
      .patch("/api/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Tiến Lê", email: "khac@example.com", role: "admin" });

    // strict: trường lạ bị từ chối chứ không âm thầm bỏ qua.
    expect(res.status).toBe(400);
    const lai = await request(app).get("/api/me/profile").set("Authorization", `Bearer ${token}`);
    expect(lai.body.email).toBe(email);
    expect(lai.body.role).toBe("customer");
  });
});
