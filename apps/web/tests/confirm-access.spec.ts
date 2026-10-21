import { expect, test, type Page } from "@playwright/test";

/**
 * Link xác nhận thuộc về một tài khoản: máy chủ trả 401/403, trang
 * khách phải nói rõ và không hiện form.
 */

const TOKEN = "test-token-chu-don";

async function dungTrang(page: Page, status: number, error: string, daDangNhap: boolean) {
  await page.route(`**/api/orders/confirm/${TOKEN}`, (r) =>
    r.fulfill({ status, json: { error, message: "x" } }),
  );
  await page.addInitScript((co: boolean) => {
    if (co) {
      localStorage.setItem("access_token", "token-gia");
      localStorage.setItem("auth_user", JSON.stringify({ full_name: "Người Lạ", email: "la@example.com" }));
    } else {
      localStorage.removeItem("access_token");
      localStorage.removeItem("auth_user");
    }
  }, daDangNhap);
  await page.goto(`/confirm/${TOKEN}`);
}

test("chưa đăng nhập mà đơn thuộc tài khoản: mời đăng nhập, không có form", async ({ page }) => {
  await dungTrang(page, 401, "LoginRequired", false);

  await expect(page.getByRole("heading", { name: "Đăng nhập để xem đơn này" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Đăng nhập" }).first()).toHaveAttribute("href", "/login");
  await expect(page.getByRole("button", { name: "Xác nhận đơn hàng" })).toHaveCount(0);
});

test("đăng nhập sai tài khoản: báo đơn thuộc người khác", async ({ page }) => {
  await dungTrang(page, 403, "NotYourOrder", true);

  await expect(page.getByRole("heading", { name: "Đơn này thuộc tài khoản khác" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xác nhận đơn hàng" })).toHaveCount(0);
});

test("trang gửi kèm token đăng nhập khi mở link", async ({ page }) => {
  let authorization: string | null = null;
  await page.route(`**/api/orders/confirm/${TOKEN}`, (r) => {
    authorization = r.request().headers()["authorization"] ?? null;
    return r.fulfill({ status: 403, json: { error: "NotYourOrder", message: "x" } });
  });
  await page.addInitScript(() => localStorage.setItem("access_token", "token-gia"));
  await page.goto(`/confirm/${TOKEN}`);
  await expect(page.getByRole("heading", { name: "Đơn này thuộc tài khoản khác" })).toBeVisible();
  expect(authorization).toBe("Bearer token-gia");
});
