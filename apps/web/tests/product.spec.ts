import { test, expect, type Page } from "@playwright/test";
import { productMockList } from "../src/mocks/product";

const categoryIds: Record<string, number> = {
  "Áo sơ mi": 1,
  "Đầm & Váy": 2,
  "Quần jean": 3,
  "Phụ kiện": 4,
  "Áo thun": 5,
};

const productRows = productMockList.map((product, index) => ({
  id: String(index + 1),
  shopId: 1,
  categoryId: categoryIds[product.category] ?? 1,
  categoryName: product.category,
  code: product.id,
  name: product.name,
  description: null,
  status: product.status === "inactive" ? "archived" : "active",
  skus: [{
    id: String(index + 1),
    productId: String(index + 1),
    skuCode: product.sku,
    variantName: product.variantDetails,
    price: product.livePrice.toFixed(2),
    status: "active",
    createdAt: "2026-10-09T00:00:00.000Z",
    updatedAt: "2026-10-09T00:00:00.000Z",
  }],
  images: product.imageUrl
    ? [{
        id: String(index + 1),
        productId: String(index + 1),
        skuId: null,
        url: product.imageUrl,
        isPrimary: true,
        sortOrder: 0,
        createdAt: "2026-10-09T00:00:00.000Z",
      }]
    : [],
  createdAt: "2026-10-09T00:00:00.000Z",
  updatedAt: "2026-10-09T00:00:00.000Z",
}));

async function mockProductApi(page: Page, onImport?: () => void) {
  await page.route("**/api/products**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Shop-Id",
        },
      });
      return;
    }
    if (url.pathname.endsWith("/import.xlsx")) {
      onImport?.();
      await route.fulfill({
        status: 201,
        json: { products: 2, skus: 3, message: "Import thành công" },
      });
      return;
    }
    if (url.pathname.endsWith("/export.xlsx")) {
      await route.fulfill({
        status: 200,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers: { "Content-Disposition": 'attachment; filename="products.xlsx"' },
        body: Buffer.from("xlsx-test"),
      });
      return;
    }
    if (url.pathname.endsWith("/categories")) {
      await route.fulfill({
        json: {
          data: Object.entries(categoryIds).map(([name, id]) => ({ id, name, parentId: null })),
        },
      });
      return;
    }

    const detailMatch = url.pathname.match(/\/api\/products\/([^/]+)(?:\/skus\/([^/]+))?$/);
    if (detailMatch && !["export.xlsx", "import.xlsx", "categories"].includes(detailMatch[1])) {
      const product = productRows.find((row) => row.id === detailMatch[1]);
      const method = route.request().method();
      if (!product) {
        await route.fulfill({ status: 404, json: { message: "Product not found" } });
      } else if (detailMatch[2]) {
        await route.fulfill({
          json: product.skus.find((sku) => sku.id === detailMatch[2]) ?? product.skus[0],
        });
      } else {
        await route.fulfill({
          json: {
            ...product,
            name: method === "GET" ? "Áo Sơ Mi Linen Cổ Tàu Cao Cấp" : product.name,
            brand: null,
            listPrice: null,
            stockWarning: 15,
            triggerCode: "AO01",
            holdInventory: true,
            shippingWeightGrams: null,
            packageLengthCm: null,
            packageWidthCm: null,
            packageHeightCm: null,
          },
        });
      }
      return;
    }

    const search = (url.searchParams.get("q") || "").toLowerCase();
    const categoryId = url.searchParams.get("categoryId");
    const status = url.searchParams.get("status");
    const matching = productRows.filter((product) => {
      const matchesSearch = !search ||
        product.name.toLowerCase().includes(search) ||
        product.code.toLowerCase().includes(search) ||
        product.skus.some((sku) => sku.skuCode.toLowerCase().includes(search));
      const matchesCategory = !categoryId || String(product.categoryId) === categoryId;
      const matchesStatus = !status || product.status === status;
      return matchesSearch && matchesCategory && matchesStatus;
    });
    const pageNumber = Number(url.searchParams.get("page") || 1);
    const pageSize = Number(url.searchParams.get("pageSize") || 20);

    await route.fulfill({
      json: {
        data: matching.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
        page: pageNumber,
        pageSize,
        total: matching.length,
        summary: {
          totalProducts: productRows.length,
          activeProducts: productRows.filter((product) => product.status === "active").length,
          skuCount: productRows.reduce((total, product) => total + product.skus.length, 0),
          inactiveProducts: productRows.filter((product) => product.status !== "active").length,
        },
      },
    });
  });
}

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("product management page renders correctly and matches Stitch design", async ({
  page,
}, testInfo) => {
  const consoleErrors = collectConsoleErrors(page);
  await mockProductApi(page);
  await page.goto("/shop/products");

  // Verify page title
  await expect(
    page.getByRole("heading", { name: "Quản lý Sản phẩm" })
  ).toBeVisible();

  // Verify active sidebar tab (Sản phẩm)
  if (testInfo.project.name !== "mobile") {
    await expect(
      page.getByRole("link", { name: "Sản phẩm", exact: true })
    ).toBeVisible();
  }

  // Verify 4 KPI cards
  await expect(page.getByText("Tổng sản phẩm")).toBeVisible();
  await expect(page.getByText("Đang bán", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Tổng SKU")).toBeVisible();
  await expect(page.getByText("Đã ngừng bán")).toBeVisible();

  // Verify data items and closing codes
  await expect(page.getByText("AO01")).toBeVisible();
  await expect(page.getByText("DM02")).toBeVisible();
  await expect(page.getByText("JN04")).toBeVisible();
  await expect(page.getByText("PK03")).toBeVisible();
  await expect(page.getByText("AT99")).toBeVisible();
  await expect(page.getByText("DM05")).toBeVisible();

  // Test search functionality
  const searchInput = page.getByPlaceholder("Tìm tên, SKU hoặc mã chốt đơn...");
  await expect(searchInput).toHaveCSS("height", "36px");
  await expect(searchInput).toHaveCSS("padding-left", "44px");
  const categoryFilter = page.getByRole("combobox", { name: "Lọc theo danh mục" });
  const statusFilter = page.getByRole("combobox", { name: "Lọc theo trạng thái" });
  await expect(categoryFilter).toHaveCSS("height", "36px");
  await expect(categoryFilter).toHaveCSS("text-overflow", "ellipsis");
  await expect(statusFilter).toHaveCSS("height", "36px");
  await expect(statusFilter).toHaveCSS("text-overflow", "ellipsis");
  const filterBar = searchInput.locator("xpath=../..");
  await expect(filterBar).toHaveCSS("flex-wrap", "nowrap");
  const filterControls = [searchInput, categoryFilter, statusFilter];
  const controlCenters = await Promise.all(
    filterControls.map(async (control) => {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      return box!.y + box!.height / 2;
    })
  );
  expect(Math.max(...controlCenters) - Math.min(...controlCenters)).toBeLessThan(2);

  const pageSizeSelect = page.getByRole("combobox", { name: "Số hàng mỗi trang" });
  const paginationFooter = pageSizeSelect.locator("xpath=../../..");
  await expect(paginationFooter).toHaveCSS("flex-wrap", "nowrap");
  await expect(paginationFooter).toHaveCSS("white-space", "nowrap");
  await expect(pageSizeSelect.locator("..")).toHaveCSS("white-space", "nowrap");
  const footerCenters = await Promise.all(
    [
      paginationFooter.locator(":scope > div").first(),
      pageSizeSelect,
      paginationFooter.locator(":scope > div").last(),
    ].map(async (control) => {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      return box!.y + box!.height / 2;
    })
  );
  expect(Math.max(...footerCenters) - Math.min(...footerCenters)).toBeLessThan(2);

  await searchInput.fill("Linen");
  await expect(page.getByText("Áo sơ mi Linen Cổ Tàu Form Rộng")).toBeVisible();
  await expect(page.getByText("Quần Jean Ống Suông Lưng Cao Vintage")).not.toBeVisible();

  // Clear search
  await searchInput.fill("");
  await expect(page.getByText("Quần Jean Ống Suông Lưng Cao Vintage")).toBeVisible();

  // Test navigation to the new product form
  const addBtn = page.getByRole("button", { name: /Thêm sản phẩm mới/ });
  await expect(addBtn).toHaveText("Thêm sản phẩm mới");
  await expect(addBtn).toHaveCSS("white-space", "nowrap");
  await expect(page.getByRole("button", { name: "Xuất danh sách" })).toHaveCSS(
    "white-space",
    "nowrap"
  );
  await expect(page.getByRole("button", { name: "Nhập file Excel" })).toHaveCSS(
    "white-space",
    "nowrap"
  );
  await addBtn.click();
  await expect(page).toHaveURL(/\/shop\/products\/new$/);
  await expect(
    page.getByRole("heading", { name: "Tạo sản phẩm mới" })
  ).toBeVisible();
  const statusRadios = page.locator('input[name="product_status"]');
  await expect(statusRadios).toHaveCount(3);
  for (const radio of await statusRadios.all()) {
    const box = await radio.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(16);
    expect(box!.height).toBe(16);
  }
  const activeStatusDescription = page.getByText(
    "Sẵn sàng nhận diện & chốt đơn live"
  );
  const descriptionBox = await activeStatusDescription.boundingBox();
  expect(descriptionBox).not.toBeNull();
  expect(descriptionBox!.width).toBeGreaterThan(150);

  for (const label of [
    "Tổng tồn kho nhập",
    "Ngưỡng cảnh báo tồn kho",
    "Trọng lượng đóng gói",
  ]) {
    const numberInput = page.getByRole("spinbutton", { name: label });
    await expect(numberInput).toHaveCSS("height", "40px");
    await expect(numberInput).toHaveCSS("padding-right", "56px");
    await expect(numberInput).toHaveCSS("appearance", "textfield");
  }
  for (const label of ["Dài", "Rộng", "Cao"]) {
    const dimensionInput = page.getByRole("spinbutton", {
      name: `Kích thước ${label.toLowerCase()} (cm)`,
    });
    await expect(dimensionInput).toHaveCSS("height", "40px");
    await expect(dimensionInput).toHaveCSS("padding-right", "36px");
  }
  const triggerCodeInput = page.getByRole("textbox", {
    name: "Mã chốt đơn chính",
  });
  await expect(triggerCodeInput).toHaveCSS("height", "44px");
  await expect(triggerCodeInput).toHaveCSS("padding-left", "40px");

  // Check no horizontal overflow
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  ).toBe(true);

  expect(consoleErrors).toEqual([]);
});

test("product management page shows the database empty state without mock rows", async ({ page }) => {
  await page.route("**/api/products**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/categories")) {
      await route.fulfill({ json: { data: [] } });
      return;
    }
    await route.fulfill({
      json: {
        data: [],
        page: 1,
        pageSize: 10,
        total: 0,
        summary: {
          totalProducts: 0,
          activeProducts: 0,
          skuCount: 0,
          inactiveProducts: 0,
        },
      },
    });
  });

  await page.goto("/shop/products");

  await expect(page.getByText("Chưa có sản phẩm trong database.")).toBeVisible();
  await expect(page.getByText("AO01")).not.toBeVisible();
  await expect(page.getByText("248", { exact: true })).not.toBeVisible();
});

test("export button downloads the xlsx file", async ({ page }) => {
  await mockProductApi(page);
  await page.goto("/shop/products");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất danh sách" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("products.xlsx");
});

test("import button uploads an xlsx file and shows the API result", async ({ page }) => {
  let importRequestCount = 0;
  await mockProductApi(page, () => { importRequestCount += 1; });
  await page.goto("/shop/products");

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Nhập file Excel" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "products.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("xlsx-test"),
  });

  await expect.poll(() => importRequestCount).toBe(1);
  await expect(page.getByText("Đã nhập 2 sản phẩm và 3 SKU.")).toBeVisible();
});

test("product edit route matches the editing workflow on desktop and mobile", async ({ page }) => {
  await mockProductApi(page);
  await page.goto("/shop/products");
  await page.getByTitle("Chỉnh sửa").first().click();

  await expect(page).toHaveURL(/\/shop\/products\/1\/edit$/);
  await expect(
    page.getByRole("heading", { name: "Chỉnh sửa sản phẩm" })
  ).toBeVisible();
  await expect(page.locator("#product-name")).toHaveValue(
    "Áo Sơ Mi Linen Cổ Tàu Cao Cấp"
  );
  await expect(page.getByText("4. Bảng cấu hình biến thể & SKU riêng")).toBeVisible();

  const editStatusRadios = page.locator('input[name="product-status"]');
  await expect(editStatusRadios).toHaveCount(3);
  for (const radio of await editStatusRadios.all()) {
    const box = await radio.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(16);
    expect(box!.height).toBe(16);
  }

  const triggerCodeInput = page.locator("#trigger-code");
  await expect(triggerCodeInput).toHaveCSS("height", "36px");
  const triggerCodePrefix = triggerCodeInput.locator("xpath=../span");
  const [prefixBox, codeBox] = await Promise.all([
    triggerCodePrefix.boundingBox(),
    triggerCodeInput.boundingBox(),
  ]);
  expect(prefixBox).not.toBeNull();
  expect(codeBox).not.toBeNull();
  expect(prefixBox!.x + prefixBox!.width).toBeLessThanOrEqual(codeBox!.x);

  const holdInventoryCheckbox = page.getByRole("checkbox", {
    name: "Tự động giữ tồn kho 15 phút",
  });
  const checkboxBox = await holdInventoryCheckbox.boundingBox();
  expect(checkboxBox).not.toBeNull();
  expect(checkboxBox!.width).toBe(16);
  expect(checkboxBox!.height).toBe(16);

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  ).toBe(true);

  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page).toHaveURL(/\/shop\/products$/);
});
