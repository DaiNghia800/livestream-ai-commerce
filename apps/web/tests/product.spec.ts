import { test, expect, type Page } from "@playwright/test";

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("product management page renders correctly and matches Stitch design", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/shop/products");

  // Verify page title
  await expect(
    page.getByRole("heading", { name: "Quản lý Sản phẩm" })
  ).toBeVisible();

  // Verify active sidebar tab (Sản phẩm)
  await expect(
    page.getByRole("link", { name: "Sản phẩm", exact: true })
  ).toBeVisible();

  // Verify 4 KPI cards
  await expect(page.getByText("Tổng sản phẩm")).toBeVisible();
  await expect(page.getByText("Đang mở bán trên Live")).toBeVisible();
  await expect(page.getByText("Sắp hết hàng")).toBeVisible();
  await expect(page.getByText("Đã ngừng bán")).toBeVisible();

  // Verify data items and closing codes
  await expect(page.getByText("AO01")).toBeVisible();
  await expect(page.getByText("DM02")).toBeVisible();
  await expect(page.getByText("JN04")).toBeVisible();
  await expect(page.getByText("PK03")).toBeVisible();
  await expect(page.getByText("AT99")).toBeVisible();
  await expect(page.getByText("DM05")).toBeVisible();

  // Test search functionality
  const searchInput = page.getByPlaceholder(/Tìm theo Tên SP, SKU, Mã chốt đơn/);
  await searchInput.fill("Linen");
  await expect(page.getByText("Áo sơ mi Linen Cổ Tàu Form Rộng")).toBeVisible();
  await expect(page.getByText("Quần Jean Ống Suông Lưng Cao Vintage")).not.toBeVisible();

  // Clear search
  await searchInput.fill("");
  await expect(page.getByText("Quần Jean Ống Suông Lưng Cao Vintage")).toBeVisible();

  // Test quick filter chips
  const bestSellerChip = page.getByTestId("best-seller-filter");
  await bestSellerChip.click();
  await expect(page.getByText("AO01")).toBeVisible();
  await expect(page.getByText("DM05")).toBeVisible();
  await expect(page.getByText("PK03")).not.toBeVisible();
  await bestSellerChip.click(); // toggle off

  // Test navigation to the new product form
  const addBtn = page.getByRole("button", { name: /Thêm sản phẩm mới/ });
  await addBtn.click();
  await expect(page).toHaveURL(/\/shop\/products\/new$/);
  await expect(
    page.getByRole("heading", { name: "Tạo sản phẩm mới" })
  ).toBeVisible();

  // Check no horizontal overflow
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  ).toBe(true);

  expect(consoleErrors).toEqual([]);
});
