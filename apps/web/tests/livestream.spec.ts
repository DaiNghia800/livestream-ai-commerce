import { test, expect, type Page } from "@playwright/test";

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text();
      if (
        !text.includes("net::ERR_CONNECTION_REFUSED") &&
        !text.includes("net::ERR_CONNECTION_FAILED")
      ) {
        errors.push(text);
      }
    }
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/livestreams*", (route) => {
    route.abort("connectionfailed");
  });
});

test("livestream overview page renders KPI cards, status filters, search, and navigation", async ({
  page,
}, testInfo) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/shop/livestream");

  // 1. Verify Page Heading and Breadcrumbs
  await expect(
    page.getByRole("heading", { name: "Quản lý Livestream", level: 1 }),
  ).toBeVisible();

  // Active navigation check on desktop
  if (testInfo.project.name !== "mobile") {
    await expect(
      page
        .getByRole("navigation", { name: "Điều hướng chủ shop" })
        .getByRole("link", { name: "Livestream", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }

  // 2. Verify 5 KPI cards in the KPI section
  const kpiSection = page.getByRole("region", {
    name: "Chỉ số hiệu quả Livestream",
  });
  await expect(kpiSection.getByText("Tổng số phiên (kỳ này)")).toBeVisible();
  await expect(kpiSection.getByText("Đang phát trực tiếp")).toBeVisible();
  await expect(kpiSection.getByText("Sắp diễn ra", { exact: true })).toBeVisible();
  await expect(kpiSection.getByText("Doanh thu tuần này")).toBeVisible();
  await expect(kpiSection.getByText("Đơn tạo từ AI")).toBeVisible();

  // 3. Verify Default Table Content
  await expect(
    page.getByText("Đại tiệc Flash Sale BST Linen Hè 2025"),
  ).toBeVisible();

  // 4. Test Search Functionality
  const searchInput = page.getByRole("textbox", { name: "Tìm kiếm livestream" });
  await searchInput.fill("Linen");
  await expect(
    page.getByText("Đại tiệc Flash Sale BST Linen Hè 2025"),
  ).toBeVisible();

  await searchInput.fill("khong-ton-tai-xyz");
  await expect(
    page.getByText("Đại tiệc Flash Sale BST Linen Hè 2025"),
  ).not.toBeVisible();
  await expect(
    page.getByText(/Không tìm thấy phiên livestream phù hợp/i),
  ).toBeVisible();

  // Clear search
  await searchInput.fill("");
  await expect(
    page.getByText("Đại tiệc Flash Sale BST Linen Hè 2025"),
  ).toBeVisible();

  // 5. Test Status Filter Pills
  const liveFilter = page.getByRole("button", { name: /Đang phát/ });
  await liveFilter.click();
  await expect(
    page.getByText("Đại tiệc Flash Sale BST Linen Hè 2025"),
  ).toBeVisible();

  // 6. Navigation to Create Livestream Page
  const createBtn = page.getByRole("link", { name: "Tạo phiên Livestream" });
  await createBtn.click();
  await expect(page).toHaveURL(/\/shop\/livestream\/create$/, {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("heading", { name: "Tạo phiên Livestream", level: 1 }),
  ).toBeVisible();

  // Check no horizontal overflow
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  expect(consoleErrors).toEqual([]);
});

test("create livestream page renders configuration form and product selection", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/shop/livestream/create");

  // Verify Header & Breadcrumb
  await expect(
    page.getByRole("heading", { name: "Tạo phiên Livestream", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Tạo phiên mới")).toBeVisible();

  // Verify Session Form Fields
  await expect(page.locator("#livestream-title")).toBeVisible();
  await expect(page.locator("#livestream-description")).toBeVisible();

  // Verify Products section
  await expect(
    page.getByRole("heading", { name: "Sản phẩm Livestream" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Thêm sản phẩm vào Live" }),
  ).toBeVisible();

  // Check layout viewport fit
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  expect(consoleErrors).toEqual([]);
});

test("livestream detail page renders details, products, and links to studio", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/shop/livestream/LIVE-2025-08");

  // Verify Heading & Status Badge
  await expect(
    page.getByRole("heading", {
      name: "Đại tiệc Flash Sale BST Linen Hè 2025",
      level: 1,
    }),
  ).toBeVisible();
  await expect(page.getByText("ĐANG DIỄN RA (LIVE)")).toBeVisible();

  // Verify Products list in this session
  await expect(page.getByText("AO01")).toBeVisible();
  await expect(page.getByText("QU02")).toBeVisible();

  // Verify Studio CTA Link
  const studioLink = page.getByRole("link", { name: /Vào Studio \(Đang phát\)/i });
  await expect(studioLink).toBeVisible();

  // Navigate to studio
  await studioLink.click();
  await expect(page).toHaveURL(/\/shop\/livestream\/LIVE-2025-08\/studio$/, {
    timeout: 15_000,
  });

  // Check layout viewport fit
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  expect(consoleErrors).toEqual([]);
});

test("unknown livestream id displays not-found feedback and returns to overview", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/shop/livestream/INVALID-SESSION-999");

  await expect(
    page.getByRole("heading", { name: "Không tìm thấy phiên Livestream" }),
  ).toBeVisible();
  await expect(page.getByText("#INVALID-SESSION-999")).toBeVisible();

  const backLink = page.getByRole("link", {
    name: "Quay về danh sách Livestream",
  });
  await expect(backLink).toBeVisible();
  await backLink.click();

  await expect(page).toHaveURL(/\/shop\/livestream$/);
  await expect(
    page.getByRole("heading", { name: "Quản lý Livestream", level: 1 }),
  ).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("broadcast studio page renders stream preview and product control panel", async ({
  page,
}, testInfo) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/shop/livestream/LIVE-2025-08/studio");

  // Verify session bar / title
  await expect(
    page.getByText("Đại tiệc Flash Sale BST Linen Hè 2025").first(),
  ).toBeVisible();

  // On mobile devices, switch to products tab to view products list
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: /Sản phẩm/ }).click();
  }

  // Verify that products in studio are rendered
  await expect(page.getByText("AO01").first()).toBeVisible();

  // Check no horizontal overflow
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  expect(consoleErrors).toEqual([]);
});

test("studio page supports collapsible sidebars, aspect ratio switcher, and compact select heights", async ({
  page,
}, testInfo) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/shop/livestream/LIVE-2025-08/studio");

  // Left sidebar is closed by default: on mobile switch tab, on desktop click toggle button
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: /Nguồn phát/ }).click();
  } else {
    await page.getByLabel("Đóng mở thanh công cụ trái").click();
  }

  // 1. Verify device controls (camera & mic selects in sidebar) are present and compact
  const camSelect = page.locator("#studio-camera-select");
  const micSelect = page.locator("#studio-mic-select");
  await expect(camSelect).toBeVisible();
  await expect(micSelect).toBeVisible();
  await expect(camSelect).toHaveClass(/studio-select/);
  await expect(micSelect).toHaveClass(/studio-select/);

  // Verify compact height (should be <= 32px, not the default ~50px)
  const camBox = await camSelect.boundingBox();
  expect(camBox).not.toBeNull();
  expect(camBox!.height).toBeLessThanOrEqual(32);

  const micBox = await micSelect.boundingBox();
  expect(micBox).not.toBeNull();
  expect(micBox!.height).toBeLessThanOrEqual(32);

  if (testInfo.project.name !== "mobile") {
    // 2. Desktop: Test left sidebar controls
    await expect(page.getByText("Nguồn & Cảnh Studio")).toBeVisible();

    // Verify left sidebar select elements have studio-select class
    const sidebarSelects = page.locator("aside select.studio-select");
    await expect(sidebarSelects.first()).toBeVisible();
    await expect(sidebarSelects.nth(1)).toBeVisible();

    // 3. Aspect Ratio toggle buttons
    const ratio169 = page.getByRole("button", { name: "16:9 Ngang" });
    const ratio916 = page.getByRole("button", { name: "9:16 Dọc Live" });
    await expect(ratio169).toBeVisible();
    await expect(ratio916).toBeVisible();

    await ratio916.click();
    await expect(ratio916).toHaveClass(/text-cyan-300/);

    await ratio169.click();
    await expect(ratio169).toHaveClass(/text-cyan-300/);

    // 4. Test Left sidebar collapse via button
    await page.getByLabel("Đóng mở thanh công cụ trái").click();
    await expect(page.getByText("Nguồn & Cảnh Studio")).not.toBeVisible();

    // Re-open via button
    await page.getByLabel("Đóng mở thanh công cụ trái").click();
    await expect(page.getByText("Nguồn & Cảnh Studio")).toBeVisible();
  }

  // Ensure no horizontal overflow
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  expect(consoleErrors).toEqual([]);
});

test("studio chat panel supports viewing messages and sending a chat message", async ({
  page,
}, testInfo) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/shop/livestream/LIVE-2025-08/studio");

  if (testInfo.project.name === "mobile") {
    // On mobile, click the mobile navigation tab "Tin nhắn"
    await page.locator("button:has-text('Tin nhắn')").first().click();
  }

  // Type a message in the chat input
  const chatInput = page.getByPlaceholder("Nhập tin nhắn...");
  await expect(chatInput).toBeVisible();

  await chatInput.fill("Chào mừng các bạn đến với phiên livestream hôm nay!");
  await page.keyboard.press("Enter");

  // Verify that the sent message appears in the chat list
  await expect(
    page.getByText("Chào mừng các bạn đến với phiên livestream hôm nay!").first(),
  ).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("live monitoring page renders session header, telemetry, and panels", async ({
  page,
}, testInfo) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/shop/livestream/LIVE-2025-08/monitoring");

  // Verify header and title
  await expect(page.getByText("Đại tiệc Flash Sale BST Linen Hè 2025").first()).toBeVisible();
  if (testInfo.project.name !== "mobile") {
    await expect(page.getByText("ĐANG PHÁT TRỰC TIẾP").first()).toBeVisible();
  }

  // Verify sections (on mobile, tabs switch between Chat and Products)
  if (testInfo.project.name === "mobile") {
    await expect(
      page.locator(".lg\\:hidden").getByText("Nguyễn Thu Thảo"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sản phẩm" }).click();
    await expect(
      page.locator(".lg\\:hidden").getByText("AO01").first(),
    ).toBeVisible();
  } else {
    await expect(
      page.locator(".lg\\:grid").getByText("AO01").first(),
    ).toBeVisible();
    await expect(
      page.locator(".lg\\:grid").getByText("Nguyễn Thu Thảo"),
    ).toBeVisible();
    await expect(page.getByText("Chỉ số thời gian thực").first()).toBeVisible();
  }

  expect(consoleErrors).toEqual([]);
});

test("livestream report page renders kpi summary, products, and order status", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/shop/livestream/LIVE-2025-07/report");

  // Verify header
  await expect(page.getByText("Báo cáo tổng kết").first()).toBeVisible();

  // Verify KPI section
  await expect(page.getByText("Lượt xem tích lũy")).toBeVisible();
  await expect(page.getByText("Đơn đã xác nhận").first()).toBeVisible();

  expect(consoleErrors).toEqual([]);
});


