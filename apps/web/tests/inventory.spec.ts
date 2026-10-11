import { test, expect, type Page } from "@playwright/test";

const item = {
  skuId: "11",
  skuCode: "SKU-TEST-1",
  variantName: "Đỏ / M",
  skuStatus: "active",
  productId: "5",
  productCode: "SP-TEST",
  productName: "Áo thun kiểm thử",
  categoryId: 1,
  categoryName: "Áo",
  imageUrl: null,
  price: "199000",
  onHandQuantity: 30,
  heldQuantity: 5,
  availableQuantity: 25,
  lowStockThreshold: 10,
  stockStatus: "in_stock",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const movement = {
  id: "1",
  skuId: "11",
  skuCode: "SKU-TEST-1",
  variantName: "Đỏ / M",
  productId: "5",
  productName: "Áo thun kiểm thử",
  movementType: "adjustment",
  delta: 10,
  heldDelta: 0,
  onHandAfter: 30,
  heldAfter: 5,
  reason: "Nhập hàng bổ sung",
  note: null,
  createdBy: "tester",
  createdAt: "2025-01-01T00:00:00.000Z",
};

async function mockApi(page: Page) {
  await page.route("**/api/inventory/adjustments/batch", (route) =>
    route.fulfill({ json: { data: [item] } }),
  );
  await page.route("**/api/inventory/adjustments**", (route) =>
    route.fulfill({
      json: {
        data: [movement],
        page: 1,
        pageSize: 20,
        total: 1,
        summary: { totalIncrease: 10, totalDecrease: 0, movementCount: 1 },
      },
    }),
  );
  await page.route(/\/api\/inventory(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        data: [item],
        page: 1,
        pageSize: 20,
        total: 1,
        summary: {
          skuCount: 1,
          totalOnHand: 30,
          totalHeld: 5,
          totalAvailable: 25,
          lowStockCount: 0,
          outOfStockCount: 0,
        },
      },
    }),
  );
  await page.route("**/api/products/categories**", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
}

test("inventory dashboard renders real API rows", async ({ page }) => {
  await mockApi(page);
  await page.goto("/shop/inventory");
  await expect(
    page.getByRole("heading", { name: "Quản lý Tồn kho & Giữ chỗ Livestream" }),
  ).toBeVisible();
  await expect(page.getByText("Áo thun kiểm thử").first()).toBeVisible();
  await expect(page.getByText("SKU-TEST-1").first()).toBeVisible();
});

test("inventory adjustment loads variants from the API", async ({ page }) => {
  await mockApi(page);
  await page.goto("/shop/inventory/adjustment?skuId=11");
  await expect(page.getByText("Áo thun kiểm thử").first()).toBeVisible();
  const input = page.getByLabel("Số lượng điều chỉnh SKU-TEST-1");
  await input.fill("5");
  await expect(page.getByRole("button", { name: /Lưu phiếu điều chỉnh/ })).toBeEnabled();
});

test("inventory history lists movements from the API", async ({ page }) => {
  await mockApi(page);
  await page.goto("/shop/inventory/history");
  await expect(
    page.getByRole("heading", { name: /Nhật ký Biến động Tồn kho/ }),
  ).toBeVisible();
  await expect(page.getByText("Nhập hàng bổ sung").first()).toBeVisible();
});
