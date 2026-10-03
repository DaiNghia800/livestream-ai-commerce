import { test, expect } from "@playwright/test";

test("inventory dashboard renders and filters stock rows", async ({
  page,
}, testInfo) => {
  await page.goto("/shop/inventory");

  await expect(
    page.getByRole("heading", {
      name: "Quản lý Tồn kho & Giữ chỗ Livestream",
    }),
  ).toBeVisible();
  if (testInfo.project.name !== "mobile") {
    await expect(
      page.getByLabel("Trạng thái kết nối IVS và Gemini"),
    ).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Đồng bộ kho WMS" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cảm biến và thiết bị" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thông báo hệ thống" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Chốt đơn ngay" })).toHaveAttribute(
    "href",
    "/shop/orders",
  );
  await expect(page.getByText("14,850")).toBeVisible();
  await expect(page.getByText("342 sản phẩm", { exact: true })).toBeVisible();
  await expect(page.getByText("14,508")).toBeVisible();
  await expect(page.getByText("8 SKU báo động", { exact: true })).toBeVisible();

  if (testInfo.project.name !== "mobile") {
    await expect(
      page.getByRole("link", { name: "Tồn kho", exact: true }),
    ).toBeVisible();
  }

  await expect(
    page.getByText("Áo sơ mi Linen Cổ Tàu Form Rộng"),
  ).toBeVisible();
  await expect(
    page.getByText("Quần Jean Ống Suông Lưng Cao Vintage"),
  ).toBeVisible();
  await expect(page.getByText("SP-POLO-012")).toBeVisible();

  const search = page.getByRole("searchbox", {
    name: "Tìm sản phẩm trong kho",
  });
  await search.fill("SP-JEAN-044");
  await expect(
    page.getByText("Quần Jean Ống Suông Lưng Cao Vintage"),
  ).toBeVisible();
  await expect(
    page.getByText("Áo sơ mi Linen Cổ Tàu Form Rộng"),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Đặt lại bộ lọc" }).click();
  await expect(search).toHaveValue("");
  await expect(
    page.getByText("Áo sơ mi Linen Cổ Tàu Form Rộng"),
  ).toBeVisible();

  await page.getByLabel("Trạng thái tồn").selectOption("low");
  await expect(
    page.getByText("Quần Jean Ống Suông Lưng Cao Vintage"),
  ).toBeVisible();
  await expect(
    page.getByText("Áo sơ mi Linen Cổ Tàu Form Rộng"),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Đặt lại bộ lọc" }).click();
  await page.getByRole("checkbox", { name: "Chọn tất cả sản phẩm" }).check();
  await expect(page.getByText("Đã chọn 6 sản phẩm")).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("inventory adjustment opens from inventory and can be canceled", async ({
  page,
}) => {
  await page.goto("/shop/inventory");
  await page.getByRole("link", { name: "Điều chỉnh tồn kho" }).click();

  await expect(page).toHaveURL("/shop/inventory/adjustment");
  await expect(
    page.getByRole("heading", { name: "Điều chỉnh Tồn kho & Cân đối WMS" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Hủy bỏ" }).click();

  await expect(page).toHaveURL("/shop/inventory");
  await expect(
    page.getByRole("heading", {
      name: "Quản lý Tồn kho & Giữ chỗ Livestream",
    }),
  ).toBeVisible();
});

test("inventory history can be opened and filtered", async ({ page }) => {
  await page.goto("/shop/inventory");
  await page.getByRole("link", { name: "Nhật ký biến động" }).click();

  await expect(page).toHaveURL("/shop/inventory/history");
  await expect(
    page.getByRole("heading", {
      name: "Nhật ký Biến động Tồn kho & Audit Log",
    }),
  ).toBeVisible();
  await expect(page.getByText("#ORD-9942")).toBeVisible();
  await expect(page.getByText("#ADJ-2025-0842")).toBeVisible();

  await page.getByRole("button", { name: /Hoàn tồn tự động/ }).click();
  await expect(page.getByText("#ORD-9925")).toBeVisible();
  await expect(page.getByText("#ORD-9942")).not.toBeVisible();

  await page.getByRole("button", { name: "Đặt lại mặc định" }).click();
  await expect(page.getByText("#ORD-9942")).toBeVisible();

  await page.getByRole("link", { name: "Tạo phiếu điều chỉnh" }).click();
  await expect(page).toHaveURL("/shop/inventory/adjustment");
});
