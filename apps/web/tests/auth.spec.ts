import { test, expect } from "@playwright/test";

test("registration returns to login without authenticating the new account", async ({ page }) => {
  let registrationBody: Record<string, unknown> | undefined;
  await page.route("**/api/auth/register", async (route) => {
    registrationBody = route.request().postDataJSON() as Record<string, unknown>;
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
  await page.getByLabel("Email").fill("name@company.com");
  await page.getByRole("textbox", { name: "Mật khẩu", exact: true }).fill("Abcdef12");
  await page.getByRole("textbox", { name: "Xác nhận mật khẩu" }).fill("Abcdef12");
  await page.getByLabel("Tôi đồng ý với điều khoản và chính sách bảo mật.").check();

  await page.getByRole("button", { name: "Tạo tài khoản" }).click();

  await expect(page).toHaveURL(/\/login\?registered=1$/);
  expect(registrationBody).not.toHaveProperty("role");
  await expect(
    page.getByRole("status").getByText("Đăng ký thành công. Vui lòng đăng nhập bằng tài khoản vừa tạo."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chào mừng trở lại!" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Đăng nhập" })).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => localStorage.getItem("access_token"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("refresh_token"))).toBeNull();
});

test("admin cannot use the shared shop login", async ({ page }) => {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "admin-access-token",
        refresh_token: "admin-refresh-token",
        user: { id: 1, email: "admin@example.com", full_name: "System Admin", role: "admin" },
      }),
    });
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByRole("textbox", { name: "Mật khẩu" }).fill("admin-pass");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(
    page.getByText(
      "Tài khoản quản trị viên cần đăng nhập riêng tại cổng /admin.",
      { exact: true }
    )
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("access_token"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("admin_access_token"))).toBeNull();
});

test("shop owner login opens the merchant dashboard", async ({ page }) => {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "shop-access-token",
        refresh_token: "shop-refresh-token",
        user: { id: 3, email: "shop@example.com", full_name: "Shop Owner", role: "shop_owner" },
      }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("shop@example.com");
  await page.getByRole("textbox", { name: "Mật khẩu" }).fill("shop-pass");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page).toHaveURL(/\/shop$/);
  expect(await page.evaluate(() => localStorage.getItem("user_role"))).toBe("shop_owner");
  await expect(page.getByText("Shop Owner", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Chủ cửa hàng", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Tổng quan hoạt động Livestream & Đơn hàng" })).toBeVisible();
});
test("admin login opens the shared merchant invitation workspace", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("access_token", "shared-shop-token");
  });
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "admin-access-token",
        refresh_token: "admin-refresh-token",
        user: { id: 1, email: "admin@example.com", full_name: "System Admin", role: "admin" },
      }),
    });
  });
  await page.route("**/api/admin/shop-invitations**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ invitations: [], total: 0 }),
    });
  });

  await page.goto("/admin");

  await expect(page.getByRole("heading", { name: "Cổng quản trị" })).toBeVisible();
  await page.getByLabel("Email quản trị").fill("admin@example.com");
  await page.getByLabel("Mật khẩu").fill("admin-pass");
  await page.getByRole("button", { name: "Đăng nhập quản trị" }).click();

  await expect(page).toHaveURL(/\/shop\/invitations$/);
  await expect(page.getByRole("heading", { name: "Quản trị hệ thống" })).toBeVisible();
  await expect(page.getByText("System Admin", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Quản trị viên", { exact: true })).toHaveCount(1);
  const openMenu = page.getByRole("button", { name: "Mở menu quản lý" });
  if (await openMenu.isVisible()) await openMenu.click();
  await expect(page.getByRole("navigation", { name: "Điều hướng chủ shop" }))
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Mời shop" }))
    .toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => localStorage.getItem("access_token"))).toBe(
    "shared-shop-token"
  );
  expect(await page.evaluate(() => localStorage.getItem("admin_access_token"))).toBe(
    "admin-access-token"
  );
});

test("admin portal refuses a non-admin login without saving credentials", async ({ page }) => {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "customer-access-token",
        refresh_token: "customer-refresh-token",
        user: { id: 2, email: "customer@example.com", role: "customer" },
      }),
    });
  });

  await page.goto("/admin");
  await page.getByLabel("Email quản trị").fill("customer@example.com");
  await page.getByLabel("Mật khẩu").fill("customer-pass");
  await page.getByRole("button", { name: "Đăng nhập quản trị" }).click();

  await expect(page.getByText("Tài khoản này không có quyền admin.", { exact: true }))
    .toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("admin_access_token"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("admin_refresh_token"))).toBeNull();
});

test("invitation workspace redirects to admin login without an admin session", async ({ page }) => {
  await page.goto("/shop/invitations");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Cổng quản trị" })).toBeVisible();
});

test("non-admin merchant sessions do not see admin navigation tabs", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("access_token", "shop-access-token");
    localStorage.setItem("user_role", "shop_owner");
  });

  await page.goto("/shop");

  await expect(page.getByRole("link", { name: "Mời shop" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Quản lý người dùng" })).toHaveCount(0);
});

test("admin creates a shop invitation in the shared merchant layout", async ({ page }) => {
  let invitations: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => {
    localStorage.setItem("admin_access_token", "admin-access-token");
    localStorage.setItem("user_role", "admin");
  });
  await page.route("**/api/admin/shop-invitations**", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(body).toMatchObject({
        full_name: "Shop Representative",
        email: "shop@example.com",
        shop_name: "Example Shop",
      });
      invitations = [{
        id: 1,
        email: "shop@example.com",
        fullName: "Shop Representative",
        shopName: "Example Shop",
        status: "pending",
        expiresAt: "2027-01-01T00:00:00.000Z",
        createdAt: "2026-12-25T00:00:00.000Z",
      }];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          invitation: invitations[0],
          token: "one-time-secret-token",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ invitations, total: invitations.length }),
    });
  });

  await page.goto("/shop/invitations");
  await expect(page.getByRole("heading", { name: "Quản trị hệ thống" })).toBeVisible();
  await page.getByLabel("Tên người đại diện").fill("Shop Representative");
  await page.getByLabel("Email đăng nhập").fill("shop@example.com");
  await page.getByLabel("Tên shop").fill("Example Shop");
  await page.getByRole("button", { name: "Tạo link mời shop" }).click();

  await expect(page.getByLabel("Link kích hoạt shop")).toHaveValue(
    /\/accept-shop-invitation#one-time-secret-token$/
  );
  await expect(page.getByText("Example Shop", { exact: true })).toBeVisible();
  const openMenu = page.getByRole("button", { name: "Mở menu quản lý" });
  if (await openMenu.isVisible()) await openMenu.click();
  await expect(page.getByRole("link", { name: "Quản lý người dùng" }))
    .toHaveAttribute("href", "/shop/users");
});

test("user management is available inside the merchant shell at /shop/users", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("admin_access_token", "admin-access-token");
    localStorage.setItem("user_role", "admin");
  });
  await page.route("**/api/admin/users?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        users: [],
        total: 0,
        currentUserId: 1,
      }),
    });
  });

  await page.goto("/shop/users");

  if ((page.viewportSize()?.width ?? 1024) <= 767) {
    await page.getByRole("button", { name: "Mở menu quản lý" }).click();
  }
  await expect(page.getByRole("navigation", { name: "Điều hướng chủ shop" }))
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Quản lý người dùng" }))
    .toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Quản lý người dùng" }))
    .toBeVisible();
});

test("shop invitation activation removes the token from the address before posting", async ({ page }) => {
  let activationBody: Record<string, unknown> | undefined;
  await page.route("**/api/auth/accept-shop-invitation", async (route) => {
    activationBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ message: "Activated" }),
    });
  });

  await page.goto("/accept-shop-invitation#single-use-token-value-123456789012345");
  await expect(page).toHaveURL(/\/accept-shop-invitation$/);
  await page.getByLabel("Mật khẩu mới").fill("secure-pass-123");
  await page.getByLabel("Nhập lại mật khẩu").fill("secure-pass-123");
  await page.getByRole("button", { name: "Kích hoạt tài khoản shop" }).click();

  await expect(page).toHaveURL(/\/login\?registered=1$/);
  expect(activationBody).toEqual({
    token: "single-use-token-value-123456789012345",
    password: "secure-pass-123",
  });
});
