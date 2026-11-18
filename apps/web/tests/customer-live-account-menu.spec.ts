import { test, expect } from "@playwright/test";

/**
 * Menu tài khoản trên header trang live. Trang live có header riêng
 * (không qua CustomerShell) nên phải kiểm riêng: khách đã đăng nhập
 * bấm avatar phải thấy đúng bốn mục như ở các trang khách khác.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("access_token", "token-gia");
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ full_name: "Minh Hằng", email: "minhhang.live@gmail.com" }),
    );
  });
  await page.goto("/");
});

const nutTaiKhoan = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "Tài khoản của tôi" });

test("bấm avatar mở menu đủ bốn mục; Esc đóng lại", async ({ page }) => {
  await nutTaiKhoan(page).click();
  const menu = page.getByRole("menu", { name: "Tài khoản của tôi" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText([
    /Thông tin cá nhân/,
    /Đơn mua/,
    /Địa chỉ nhận hàng/,
    /Đăng xuất/,
  ]);

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

test("Đơn mua đưa sang trang đơn của tôi", async ({ page }) => {
  await nutTaiKhoan(page).click();
  await page.getByRole("menuitem", { name: "Đơn mua" }).click();
  await expect(page).toHaveURL(/\/orders$/);
});

test("Đăng xuất: header đổi sang nút Đăng nhập, vẫn ở trang live", async ({ page }) => {
  await nutTaiKhoan(page).click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await expect(nutTaiKhoan(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Đăng nhập/ }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/(\?.*)?$/);
});
