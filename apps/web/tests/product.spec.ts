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
}, testInfo) => {
  const consoleErrors = collectConsoleErrors(page);
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
  const filterControls = [
    searchInput,
    categoryFilter,
    statusFilter,
    page.getByTestId("best-seller-filter"),
    page.getByRole("button", { name: "Live Pin" }),
  ];
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

  // Test quick filter chips
  const bestSellerChip = page.getByTestId("best-seller-filter");
  await bestSellerChip.click();
  await expect(page.getByText("AO01")).toBeVisible();
  await expect(page.getByText("DM05")).toBeVisible();
  await expect(page.getByText("PK03")).not.toBeVisible();
  await bestSellerChip.click(); // toggle off

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

test("product edit route matches the editing workflow on desktop and mobile", async ({ page }) => {
  await page.goto("/shop/products");
  await page.getByTitle("Chỉnh sửa").first().click();

  await expect(page).toHaveURL(/\/shop\/products\/AO01\/edit$/);
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

  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByText("Đã lưu thay đổi thành công")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  ).toBe(true);
});
