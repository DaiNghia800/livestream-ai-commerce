import { test, expect } from "@playwright/test";

test("registration returns to login without authenticating the new account", async ({ page }) => {
  await page.route("**/api/auth/register", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "registration-access-token",
        refresh_token: "registration-refresh-token",
      }),
    });
  });

  await page.goto("/register");

  await page.getByLabel("Họ và tên").fill("Nguyễn Văn A");
  await page.getByLabel("Email doanh nghiệp").fill("name@company.com");
  await page.getByRole("textbox", { name: "Mật khẩu", exact: true }).fill("Abcdef12");
  await page.getByRole("textbox", { name: "Xác nhận mật khẩu" }).fill("Abcdef12");
  await page.getByLabel("Tôi đồng ý với điều khoản và chính sách bảo mật.").check();

  await page.getByRole("button", { name: "Tạo tài khoản" }).click();

  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await expect(
    page.getByRole("status").getByText("Đăng ký thành công. Vui lòng đăng nhập bằng tài khoản vừa tạo."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chào mừng trở lại!" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Đăng nhập" })).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => localStorage.getItem("access_token"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("refresh_token"))).toBeNull();
});
