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
  status:
    product.status === "inactive"
      ? "discontinued"
      : product.availableStock === 0
        ? "archived"
        : "active",
  skus: [{
    id: String(index + 1),
    productId: String(index + 1),
    skuCode: product.sku,
    variantName: product.variantDetails,
    price: product.livePrice.toFixed(2),
    aiCode: "AO01-TEST-AI",
    availableStock: product.status === "inactive" ? 9 : product.availableStock,
    reservedStock: product.reservedStock,
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
        ...(index === 0
          ? { contentHash: "9e6d20782f5444cbaa9794b67fc50cc0f591f112e491b03e2d6de5c72f88b948" }
          : {}),
        isPrimary: true,
        sortOrder: 0,
        createdAt: "2026-10-09T00:00:00.000Z",
      }]
    : [],
  createdAt: "2026-10-09T00:00:00.000Z",
  updatedAt: "2026-10-09T00:00:00.000Z",
}));

async function mockProductApi(
  page: Page,
  onImport?: () => void,
  onCreateCategory?: (name: string) => void,
  configureRows?: (rows: typeof productRows) => void
) {
  const rows = structuredClone(productRows);
  configureRows?.(rows);
  await page.route("**/api/inventory**", async (route) => {
    await route.fulfill({
      json: {
        data: [],
        page: 1,
        pageSize: 1,
        total: 0,
        filteredTotalHeld: 0,
        summary: {
          skuCount: 0,
          totalOnHand: 0,
          totalHeld: 0,
          totalAvailable: 0,
          lowStockCount: 0,
          outOfStockCount: 0,
        },
      },
    });
  });
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
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() as { name: string };
        onCreateCategory?.(body.name);
        await route.fulfill({
          status: 201,
          json: { data: { id: 6, name: body.name, parentId: null } },
        });
        return;
      }
      await route.fulfill({
        json: {
          data: Object.entries(categoryIds).map(([name, id]) => ({ id, name, parentId: null })),
        },
      });
      return;
    }

    if (url.pathname.endsWith("/history")) {
      await route.fulfill({
        json: {
          data: [{
            id: "1",
            summary: "Cập nhật thông tin sản phẩm",
            changes: {
              brand: { from: "Nhãn cũ", to: "Linen Heritage Vietnam" },
              listPrice: { from: 420000, to: 450000 },
            },
            createdAt: "2026-10-13T10:30:00.000Z",
          }],
        },
      });
      return;
    }

    const detailMatch = url.pathname.match(/\/api\/products\/([^/]+)(?:\/skus\/([^/]+))?$/);
    if (detailMatch && !["export.xlsx", "import.xlsx", "categories"].includes(detailMatch[1])) {
      const product = rows.find((row) => row.id === detailMatch[1]);
      const method = route.request().method();
      if (!product) {
        await route.fulfill({ status: 404, json: { message: "Product not found" } });
      } else if (detailMatch[2]) {
        const sku = product.skus.find((item) => item.id === detailMatch[2]) ?? product.skus[0];
        if (method === "PATCH") {
          Object.assign(sku, route.request().postDataJSON());
        } else if (method === "DELETE") {
          sku.status = "discontinued";
        }
        await route.fulfill({
          json: sku,
        });
      } else {
        if (method === "PATCH") {
          Object.assign(product, route.request().postDataJSON());
        }
        await route.fulfill({
          json: {
            ...product,
            name: method === "GET" ? "Áo Sơ Mi Linen Cổ Tàu Cao Cấp" : product.name,
            brand: "Linen Heritage Vietnam",
            listPrice: "450000.00",
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
    const matching = rows.filter((product) => {
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
          totalProducts: rows.length,
          activeProducts: rows.filter((product) => product.status === "active").length,
          skuCount: rows.reduce((total, product) => total + product.skus.length, 0),
          inactiveProducts: rows.filter((product) => product.status !== "active").length,
          updatedThisWeekCount: 2,
        },
      },
    });
  });
}

test("product list hides archived and discontinued SKU variants after editing", async ({ page }) => {
  await mockProductApi(page, undefined, undefined, (rows) => {
    rows[0].skus = ["Đỏ", "Trắng", "Đen"].map((variantName, index) => ({
      ...rows[0].skus[0],
      id: String(index + 1),
      skuCode: `AO01-${index + 1}`,
      variantName,
      status: "active",
    }));
  });
  await page.goto("/shop/products");

  const productRow = page.getByRole("row").filter({ hasText: "AO01" });
  await expect(productRow.getByText("Đỏ, Trắng, Đen")).toBeVisible();
  await productRow.locator('button[title="Chỉnh sửa"]').click();

  await page.getByRole("combobox", { name: "Trạng thái SKU 2" }).selectOption("archived");
  await page.getByRole("combobox", { name: "Trạng thái SKU 3" }).selectOption("discontinued");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page).toHaveURL(/\/shop\/products$/);

  const updatedProductRow = page.getByRole("row").filter({ hasText: "AO01" });
  const productNameCell = updatedProductRow.locator("td").nth(1);
  await expect(productNameCell).toContainText("Áo sơ mi • Đỏ");
  await expect(productNameCell).not.toContainText("Trắng");
  await expect(productNameCell).not.toContainText("Đen");
});

test("product list status toggle is reflected by SKU statuses on edit page", async ({ page }) => {
  await mockProductApi(page);
  await page.goto("/shop/products");

  const productRow = page.getByRole("row").filter({ hasText: "AO01" });
  await productRow.locator('button[title="Ngừng bán"]').click();
  await expect(productRow.getByText("Ngừng bán", { exact: true })).toBeVisible();
  await productRow.locator('button[title="Chỉnh sửa"]').click();

  await expect(page.getByRole("radio", { name: /Ngừng bán/ })).toBeChecked();
  await expect(page.getByText(/Sản phẩm hiện .*ghim trong một phiên livestream/)).toHaveCount(0);
  const skuStatus = page.getByRole("combobox", { name: "Trạng thái SKU 1" });
  await expect(skuStatus).toHaveValue("discontinued");
  await expect(skuStatus).toBeDisabled();

  await page.getByRole("radio", { name: /Đang bán/ }).click();
  await expect(skuStatus).toHaveValue("active");
  await expect(skuStatus).toBeEnabled();
});

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
  await expect(page.getByText("Đang mở bán trên Live")).toBeVisible();
  await expect(page.getByText("Sắp hết hàng")).toBeVisible();
  await expect(page.getByText("Đã ngừng bán")).toBeVisible();
  for (const header of await page.getByRole("table").locator("thead tr").last().locator("th").all()) {
    await expect(header).toHaveCSS("white-space", "nowrap");
  }
  await expect(
    page.getByRole("table", { name: "Danh sách sản phẩm trong kho và livestream" })
      .locator('input[type="checkbox"]')
  ).toHaveCount(0);

  // Verify data items and closing codes
  await expect(page.getByText("AO01")).toBeVisible();
  await expect(page.getByText("DM02")).toBeVisible();
  await expect(page.getByText("JN04")).toBeVisible();
  await expect(page.getByText("PK03")).toBeVisible();
  await expect(page.getByText("AT99")).toBeVisible();
  await expect(page.getByText("DM05")).toBeVisible();

  const statusFilter = page.getByRole("combobox", { name: "Lọc theo trạng thái" });
  await statusFilter.selectOption("archived");
  await expect(page.getByText("PK03")).toBeVisible();
  await expect(page.getByText("AT99")).toHaveCount(0);
  const archivedProductRow = page.getByRole("row").filter({ hasText: "PK03" });
  await expect(archivedProductRow.getByText("Đã lưu trữ")).toBeVisible();
  await archivedProductRow.locator('button[title="Bổ sung tồn kho để kích hoạt lại"]').click();
  await expect(
    page.getByText("Hãy bổ sung tồn kho trước khi kích hoạt lại", { exact: false })
  ).toBeVisible();
  await statusFilter.selectOption("discontinued");
  await expect(page.getByText("AT99")).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "AT99" }).getByText("Ngừng bán", { exact: true })
  ).toBeVisible();
  await statusFilter.selectOption("");

  // Test search functionality
  const searchInput = page.getByPlaceholder(
    "Tìm theo Tên SP, SKU, Mã chốt đơn (VD: AO01, SP-LINEN)..."
  );
  await expect(searchInput).toHaveCSS("height", "40px");
  await expect(searchInput).toHaveCSS("padding-left", "36px");
  const categoryFilter = page.getByRole("combobox", { name: "Lọc theo danh mục" });
  await expect(categoryFilter).toHaveCSS("height", "40px");
  await expect(categoryFilter).toHaveCSS("text-overflow", "ellipsis");
  await expect(statusFilter).toHaveCSS("height", "40px");
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
  if (testInfo.project.name !== "mobile") {
    expect(Math.max(...controlCenters) - Math.min(...controlCenters)).toBeLessThan(2);
  }

  const pageSizeSelect = page.getByRole("combobox", { name: "Số hàng mỗi trang" });
  const paginationFooter = pageSizeSelect.locator("xpath=../../..");
  if (testInfo.project.name !== "mobile") {
    await expect(paginationFooter).toHaveCSS("flex-wrap", "nowrap");
  }
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
  if (testInfo.project.name !== "mobile") {
    expect(Math.max(...footerCenters) - Math.min(...footerCenters)).toBeLessThan(2);
  }

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
  await expect(page.getByText("Ảnh đã tải lên (0 ảnh)")).toBeVisible();
  await expect(page.getByRole("img", { name: "Ảnh sản phẩm chính" })).toHaveCount(0);
  const productNameInput = page.getByPlaceholder("VD: Áo Sơ Mi Linen Cổ Tàu Dài Tay...");
  await expect(productNameInput).toHaveValue("");
  await expect(productNameInput).toHaveAttribute(
    "placeholder",
    "VD: Áo Sơ Mi Linen Cổ Tàu Dài Tay..."
  );
  const brandInput = page.getByPlaceholder("VD: Linen Heritage Vietnam");
  await expect(brandInput).toHaveValue("");
  await expect(brandInput).toHaveAttribute("placeholder", "VD: Linen Heritage Vietnam");
  const categoryAndBrand = [
    page.getByRole("combobox", { name: "Chọn danh mục đã có" }),
    brandInput,
  ];
  if (testInfo.project.name !== "mobile") {
    const brandBox = await categoryAndBrand[1].boundingBox();
    expect(brandBox).not.toBeNull();
    await expect(categoryAndBrand[0]).toBeVisible();
  }
  const productImage = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p3sAAAAASUVORK5CYII=",
    "base64"
  );
  await page.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').setInputFiles({
    name: "product.png",
    mimeType: "image/png",
    buffer: productImage,
  });
  await expect(page.getByText("Ảnh đã tải lên (1 ảnh)")).toBeVisible();
  await page.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').setInputFiles({
    name: "duplicate.png",
    mimeType: "image/png",
    buffer: productImage,
  });
  await expect(page.getByText("Ảnh sản phẩm không được trùng nhau.")).toBeVisible();
  await expect(page.getByText("Ảnh đã tải lên (1 ảnh)")).toBeVisible();
  await page.getByRole("button", { name: "Remove image 1" }).click();
  await expect(page.getByText("Ảnh đã tải lên (0 ảnh)")).toBeVisible();
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
    "Ngưỡng cảnh báo",
  ]) {
    const numberInput = page.getByRole("spinbutton", { name: label });
    await expect(numberInput).toHaveCSS("height", "40px");
    await expect(numberInput).toHaveCSS("padding-right", "56px");
    await expect(numberInput).toHaveCSS("appearance", "textfield");
  }
  await expect(page.getByRole("heading", { name: "Thông tin chung" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hình ảnh sản phẩm" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Thuộc tính vận chuyển" })).toHaveCount(0);
  await expect(page.getByText("Tự động lưu nháp 1 phút trước")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Áp dụng giá chung" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Đặt tồn đồng loạt" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Mô tả chi tiết sản phẩm" })).toHaveValue("");
  const triggerCodeInput = page.getByRole("textbox", {
    name: "Mã chốt đơn chính",
  });
  await expect(triggerCodeInput).toHaveValue("");
  await expect(triggerCodeInput).toHaveAttribute("placeholder", "VD: AO01");
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
          updatedThisWeekCount: 0,
        },
      },
    });
  });
  await page.route("**/api/inventory**", async (route) => {
    await route.fulfill({
      json: {
        data: [],
        page: 1,
        pageSize: 1,
        total: 0,
        summary: {
          skuCount: 0,
          totalOnHand: 0,
          totalHeld: 0,
          totalAvailable: 0,
          lowStockCount: 0,
          outOfStockCount: 0,
        },
      },
    });
  });

  await page.goto("/shop/products");

  await expect(page.getByText("Chưa có sản phẩm trong database.")).toBeVisible();
  await expect(page.getByText("AO01")).not.toBeVisible();
  await expect(page.getByText("248", { exact: true })).not.toBeVisible();
});

test("product edit page shows existing SKU data read-only and saves product changes", async ({ page }) => {
  await mockProductApi(page);
  await page.goto("/shop/products/1/edit");

  await expect(page.getByRole("heading", { name: "Chỉnh sửa sản phẩm" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Giá bán & Tồn kho WMS" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Thiết lập Mã Chốt Đơn AI" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lịch sử chỉnh sửa & thông tin hệ thống" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Khả dụng" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Trạng thái" })).toBeVisible();
  await expect(page.getByLabel("Mã chốt đơn chính (Keyword Code) *")).toHaveText("AO01");
  await expect(page.getByRole("textbox", { name: "Mã chốt đơn chính (Keyword Code) *" })).toHaveCount(0);
  await expect(page.getByText("Mã chốt đơn chính sẽ được dùng bởi bộ nhận diện hiện tại").locator("..")).toHaveCSS("height", "40px");
  await expect(page.getByRole("textbox", { name: "Thương hiệu / Nhãn hiệu" })).toHaveValue("Linen Heritage Vietnam");
  await expect(page.getByRole("textbox", { name: "Mã chốt đơn AI (Trigger Code)" })).toHaveCount(0);
  const systemCard = page.locator(".card").filter({
    has: page.getByRole("heading", { name: "Lịch sử chỉnh sửa & thông tin hệ thống" }),
  });
  await expect(systemCard.getByText("AO01", { exact: true })).toBeVisible();
  await expect(systemCard.getByText("1", { exact: true })).toHaveCount(0);
  const skuConfigCard = page.locator(".card").filter({
    has: page.getByRole("heading", { name: "Bảng cấu hình biến thể & SKU riêng" }),
  });
  const aiSetupCard = page.locator(".card").filter({
    has: page.getByRole("heading", { name: "Thiết lập Mã Chốt Đơn AI" }),
  });
  await expect(skuConfigCard.getByRole("spinbutton", { name: "Ngưỡng cảnh báo SKU 1" })).toBeVisible();
  await expect(skuConfigCard.getByRole("spinbutton", { name: "Ngưỡng cảnh báo SKU 1" })).toHaveValue("15");
  await expect(skuConfigCard.locator('[aria-label="Mã phụ AI 1"]')).toHaveText("AO01-TEST-AI");
  await expect(aiSetupCard.getByRole("spinbutton", { name: "Ngưỡng cảnh báo tồn kho" })).toHaveCount(0);
  const stockWarning = skuConfigCard.getByRole("spinbutton", { name: "Ngưỡng cảnh báo SKU 1" });
  await expect(stockWarning.locator("xpath=ancestor::td")).toHaveCount(1);
  await expect(stockWarning.locator("xpath=ancestor::td")).not.toHaveAttribute("rowspan");
  await expect(page.getByRole("heading", { name: "Trạng thái bán hàng" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Hình ảnh sản phẩm/ })).toBeVisible();
  await page.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').setInputFiles({
    name: "duplicate-product.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p3sAAAAASUVORK5CYII=",
      "base64"
    ),
  });
  await expect(page.getByText("Ảnh sản phẩm không được trùng nhau.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hình ảnh sản phẩm (1/8)" })).toBeVisible();
  const flashPrice = page.getByLabel("Giá Flash Live (VND) *");
  await expect(page.getByRole("textbox", { name: "Giá niêm yết (VND)" })).toHaveValue("450.000");
  await expect(flashPrice).toHaveValue("299.000");
  await flashPrice.fill("309000");
  await expect(flashPrice).toHaveValue("309.000");
  await expect(skuConfigCard.locator('[aria-label="Giá Flash Live SKU 1"]')).toHaveText("309.000");
  const historyButton = page.getByRole("button", { name: "Xem chi tiết lịch sử" });
  await historyButton.scrollIntoViewIfNeeded();
  await historyButton.click();
  await expect(page.getByText("Cập nhật thông tin sản phẩm")).toBeVisible();
  await expect(page.getByText("Nhãn cũ → Linen Heritage Vietnam")).toBeVisible();
  await expect(page.getByText("420.000 → 450.000")).toBeVisible();
  await expect(page.locator("time[datetime='2026-10-13T10:30:00.000Z']")).toBeVisible();
  await expect(stockWarning).toBeVisible();
  const expectedColumns = [
    "Phân loại",
    "Mã SKU",
    "Mã phụ AI",
    "Tổng tồn",
    "Khả dụng",
    "Đang giữ",
    "Ngưỡng cảnh báo",
    "Giá Flash Live (VND)",
    "Trạng thái",
    "Thao tác",
  ];
  const headers = page.getByRole("table").locator("thead th");
  await expect(headers).toHaveCount(expectedColumns.length);
  for (let index = 0; index < expectedColumns.length; index += 1) {
    await expect(headers.nth(index)).toHaveText(expectedColumns[index]);
    await expect(headers.nth(index)).toHaveCSS("white-space", "nowrap");
  }
  await expect(skuConfigCard.getByRole("textbox", { name: "Giá Flash Live SKU 1" })).toHaveCount(0);
  await expect(skuConfigCard.locator('[aria-label="Giá Flash Live SKU 1"]')).toHaveText("309.000");
  await expect(skuConfigCard.locator('[aria-label="Phân loại SKU 1"]')).toHaveText("Áo sơ mi • Trắng, Be, Xanh Pastel");
  await expect(skuConfigCard.locator('[aria-label="Mã SKU 1"]')).toHaveText("SP-LINEN-001");
  await expect(skuConfigCard.getByRole("button", { name: "Thêm biến thể" })).toHaveCount(0);
  await expect(page.getByText("Mã chốt đơn chính (Keyword Code) *", { exact: false })).toBeVisible();
  await expect(page.getByText("3. Thuộc tính đóng gói & vận chuyển")).toHaveCount(0);

  const skuRows = page.getByRole("table").locator("tbody tr");
  await expect(skuRows).toHaveCount(1);
  for (const row of await skuRows.all()) {
    await expect(row.locator("td")).toHaveCount(10);
    await expect(row.locator("input, select")).toHaveCount(2);
    for (const control of await row.locator("input, select").all()) {
      await expect(control).toHaveCSS("height", "40px");
    }
    await expect(row.getByRole("spinbutton", { name: /^Tổng tồn SKU/ })).toHaveCount(0);
    for (const columnIndex of [3, 4, 5]) {
      await expect(row.locator("td").nth(columnIndex)).toHaveCSS("width", "112px");
    }
    await expect(row.getByRole("spinbutton", { name: /^Ngưỡng cảnh báo SKU/ })).toHaveCount(1);
    await expect(row.getByRole("spinbutton", { name: /^Ngưỡng cảnh báo SKU/ })).toHaveCSS("width", "96px");
  }
  await expect(skuRows.nth(0).getByRole("spinbutton", { name: "Ngưỡng cảnh báo SKU 1" })).toHaveCSS("width", "96px");
  let savedSkuPrice: number | undefined;
  page.on("request", (request) => {
    if (request.method() === "PATCH" && /\/api\/products\/[^/]+\/skus\/[^/]+$/.test(request.url())) {
      savedSkuPrice = (request.postDataJSON() as { price: number }).price;
    }
  });
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page).toHaveURL(/\/shop\/products$/);
  expect(savedSkuPrice).toBe(309000);
});

test("create product form sends configured product details to the API", async ({ page }) => {
  let createdCategoryName: string | undefined;
  await mockProductApi(page, undefined, (name) => { createdCategoryName = name; });
  let createPayload: Record<string, unknown> | undefined;
  await page.route("**/api/products", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    createPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      json: { ...productRows[0], id: "99" },
    });
  });

  await page.goto("/shop/products/new");
  const addVariantButton = page.getByRole("button", { name: "Thêm biến thể" });
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await addVariantButton.click();
  const colorInputs = page.locator('tbody input[aria-label="Màu sắc"]');
  await expect(colorInputs).toHaveCount(1);
  await expect(colorInputs.first()).toHaveValue("");
  await addVariantButton.click();
  await expect(colorInputs).toHaveCount(2);
  const firstAttributeNameInput = page.getByRole("textbox", { name: "Tên thuộc tính thứ nhất" });
  await firstAttributeNameInput.fill("");
  await page.getByRole("button", { name: "Lưu sản phẩm" }).click();
  await expect(firstAttributeNameInput).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Vui lòng kiểm tra tên hai thuộc tính của biến thể.", { exact: true })).toBeVisible();
  await firstAttributeNameInput.fill("Màu sắc");
  const triggerCode = page.getByRole("textbox", { name: "Mã chốt đơn chính" });
  await page.getByPlaceholder("VD: Áo Sơ Mi Linen Cổ Tàu Dài Tay...").fill("Áo Sơ Mi Linen Cổ Tàu Cao Cấp");
  await page.getByRole("textbox", { name: "Nhập danh mục mới" }).fill("Shoes");
  await expect(page.getByRole("combobox", { name: "Chọn danh mục đã có" })).toHaveValue("");
  await page.getByPlaceholder("VD: Linen Heritage Vietnam").fill("Linen Heritage Vietnam");
  const listedPrice = page.getByRole("textbox", { name: "Giá niêm yết (VND)" });
  const livePrice = page.getByRole("textbox", { name: "Giá Flash Live (VND)" });
  const totalStock = page.getByRole("spinbutton", { name: "Tổng tồn kho nhập" });
  const stockWarning = page.getByRole("spinbutton", { name: "Ngưỡng cảnh báo tồn kho" });
  await expect(listedPrice).toHaveValue("0");
  await expect(livePrice).toHaveValue("0");
  await expect(totalStock).toHaveValue("0");
  await expect(totalStock).toHaveAttribute("readonly", "");
  await expect(stockWarning).toHaveValue("0");
  await expect(page.getByText("-34%", { exact: true })).toHaveCount(0);

  for (const [field, invalidValue, expectedError] of [
    [listedPrice, "", "Trường này không được để trống."],
    [livePrice, "-1", "Chỉ nhập số tiền không âm."],
    [stockWarning, "1.5", "Nhập số nguyên không âm."],
  ] as const) {
    await field.fill(invalidValue);
    await field.blur();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    const errorId = await field.getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    await expect(page.locator(`#${errorId}`)).toHaveText(expectedError);
  }
  await listedPrice.fill("400000");
  await listedPrice.blur();
  await expect(listedPrice).toHaveValue("400.000");
  await livePrice.fill("200000");
  await livePrice.blur();
  await expect(livePrice).toHaveValue("200.000");

  await listedPrice.fill("450.000");
  await livePrice.fill("500.000");
  await livePrice.blur();
  await expect(listedPrice).toHaveAttribute("aria-invalid", "true");
  await expect(livePrice).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#listed-price-error")).toHaveText(
    "Giá niêm yết không được nhỏ hơn Giá Flash Live."
  );
  await expect(page.locator("#live-price-error")).toHaveText(
    "Giá Flash Live không được vượt quá giá niêm yết."
  );
  await livePrice.fill("299.000");
  await expect(listedPrice).toHaveAttribute("aria-invalid", "false");
  await expect(livePrice).toHaveAttribute("aria-invalid", "false");
  const variantPrices = page.locator('tbody input[aria-label="Giá Live"]');
  await expect(variantPrices).toHaveCount(2);
  for (const price of await variantPrices.all()) {
    await expect(price).toHaveValue("299.000");
    await expect(price).toHaveAttribute("readonly", "");
  }
  await stockWarning.fill("15");
  await colorInputs.nth(0).fill("Trắng");
  await colorInputs.nth(1).fill("Trắng");
  const sizeInputs = page.locator('tbody input[aria-label="Size"]');
  await sizeInputs.nth(0).fill("M");
  await sizeInputs.nth(1).fill("L");
  await triggerCode.fill("NEW01");
  const skuInputs = page.getByRole("textbox", { name: "Mã SKU" });
  const aiCodeInputs = page.getByRole("textbox", { name: "Mã phụ AI" });
  await expect(skuInputs.nth(0)).toHaveValue("NEW01-WHT-M");
  await expect(aiCodeInputs.nth(0)).toHaveValue("NEW01TM");
  await expect(skuInputs.nth(1)).toHaveValue("NEW01-WHT-L");
  await expect(aiCodeInputs.nth(1)).toHaveValue("NEW01TL");
  await expect(page.getByText("Tổ hợp giữa Size và Màu sắc")).toBeVisible();
  await expect(page.locator("tbody tr").first().locator("td").first().locator("span")).toHaveCount(0);
  await expect(page.getByText("Mã hợp lệ, chưa trùng")).toBeVisible();
  await colorInputs.nth(1).fill("Đen");
  await expect(skuInputs.nth(1)).toHaveValue("NEW01-BLK-L");
  await expect(aiCodeInputs.nth(1)).toHaveValue("NEW01DL");
  await colorInputs.nth(1).fill("Trắng");
  await firstAttributeNameInput.fill("Chất liệu");
  await page.getByRole("textbox", { name: "Tên thuộc tính thứ hai" }).fill("Dung lượng");
  const materialInputs = page.locator('tbody input[aria-label="Chất liệu"]');
  const capacityInputs = page.locator('tbody input[aria-label="Dung lượng"]');
  await materialInputs.nth(0).fill("Linen");
  await capacityInputs.nth(0).fill("500ml");
  await materialInputs.nth(1).fill("Linen");
  await capacityInputs.nth(1).fill("750ml");
  await expect(skuInputs.nth(0)).toHaveValue("NEW01-LIN-500ML");
  await expect(aiCodeInputs.nth(0)).toHaveValue("NEW01L500ML");
  await expect(page.getByText("Tổ hợp giữa Dung lượng và Chất liệu")).toBeVisible();
  const variantStocks = page.locator('tbody input[aria-label="Tồn kho biến thể"]');
  await variantStocks.first().fill("-1");
  await expect(variantStocks.first()).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator('[id$="-stock-error"]').first()).toHaveText(
    "Tồn kho phải là số nguyên không âm."
  );
  await variantStocks.first().fill("0");
  await expect(variantStocks.first()).toHaveAttribute("aria-invalid", "false");
  await variantStocks.first().fill("25");
  await expect(totalStock).toHaveValue("25");
  await variantStocks.first().fill("0");
  await expect(totalStock).toHaveValue("0");
  await capacityInputs.nth(1).fill("500ml");
  await expect(skuInputs.nth(1)).toHaveValue("NEW01-LIN-500ML");
  await expect(aiCodeInputs.nth(1)).toHaveValue("NEW01L500ML");
  await page.getByRole("button", { name: "Lưu sản phẩm" }).click();
  const firstColorErrorId = await materialInputs.first().getAttribute("aria-describedby");
  expect(firstColorErrorId).toBeTruthy();
  await expect(page.locator(`#${firstColorErrorId}`)).toHaveText(
    "Không thể có hai biến thể trùng tổ hợp Chất liệu và Dung lượng."
  );
  expect(createPayload).toBeUndefined();
  await capacityInputs.nth(1).fill("750ml");
  await page.getByRole("button", { name: "Lưu sản phẩm" }).click();
  await expect(page).toHaveURL(/\/shop\/products$/);
  expect(createdCategoryName).toBe("Shoes");
  expect(createPayload).toMatchObject({
    code: "NEW01",
    categoryId: 6,
    brand: "Linen Heritage Vietnam",
    listPrice: 450000,
    stockWarning: 15,
    triggerCode: "NEW01",
    skus: expect.arrayContaining([
      expect.objectContaining({
        skuCode: "NEW01-LIN-500ML",
        variantName: "Chất liệu: Linen / Dung lượng: 500ml",
        aiCode: "NEW01L500ML",
        price: 299000,
        stock: 0,
      }),
    ]),
    images: [],
  });
});

test("export button downloads the xlsx file", async ({ page }) => {
  await mockProductApi(page);
  await page.goto("/shop/products");
  await page.getByRole("combobox", { name: "Lọc theo trạng thái" }).selectOption("archived");
  let exportQuery: string | undefined;
  page.on("request", (request) => {
    if (request.url().includes("/api/products/export.xlsx")) {
      exportQuery = new URL(request.url()).search;
    }
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất danh sách" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("products.xlsx");
  expect(exportQuery).toBe("");
});

test("import button uploads an xlsx file and shows the API result", async ({ page }) => {
  let importRequestCount = 0;
  await mockProductApi(page, () => { importRequestCount += 1; });
  await page.goto("/shop/products");

  await page.getByRole("button", { name: "Nhập file Excel" }).click();
  const guidelines = page.getByRole("dialog", { name: "Quy định file nhập sản phẩm" });
  await expect(guidelines).toBeVisible();
  await expect(guidelines).toContainText("Mã chốt đơn chính");
  await expect(guidelines).toContainText("Mã SKU phải duy nhất");
  await expect(guidelines).toContainText(".xlsx");

  const chooserPromise = page.waitForEvent("filechooser");
  await guidelines.getByRole("button", { name: "OK, chọn file" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "products.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("xlsx-test"),
  });

  await expect.poll(() => importRequestCount).toBe(1);
  await expect(page.getByText("Đã nhập 2 sản phẩm và 3 SKU.")).toBeVisible();
});
