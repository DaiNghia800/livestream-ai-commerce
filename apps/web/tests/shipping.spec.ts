import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import {
  ORDER_DETAIL,
  SHIP_CHO_LAY,
  SHIP_DETAIL,
  SHIP_TU_GIAO,
  TRACKING_CHUA_CO_MA,
  stubApi,
} from "./fixtures/api";

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

// ── Màn quản lý vận chuyển ─────────────────────────────────────────

test("danh sách vận đơn hiện đủ thông tin shop cần nhìn lướt", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await stubApi(page);
  await page.goto("/shop/shipping");

  await expect(page.getByRole("heading", { name: "Vận chuyển" })).toBeVisible();
  // Mục menu phải là LINK đang active, không phải nút "Sắp có" bị khoá.
  // Trên máy nhỏ sidebar nằm sau nút mở menu.
  if (test.info().project.name === "mobile") {
    await page.getByRole("button", { name: "Mở menu quản lý" }).click();
  }
  const mucMenu = page
    .getByRole("navigation", { name: "Điều hướng chủ shop" })
    .getByRole("link", { name: "Vận chuyển" });
  await expect(mucMenu).toHaveAttribute("href", "/shop/shipping");
  await expect(mucMenu).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "GHN7728491" })).toBeVisible();
  await expect(page.getByText("Giao Hàng Nhanh").first()).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("bấm thẻ thống kê là lọc theo nhóm đó", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/shipping");

  // Trước khi lọc: thấy cả đơn đang đi lẫn đơn hỏng
  await expect(page.getByRole("link", { name: "GHTK9023194" })).toBeVisible();
  await expect(page.getByRole("link", { name: "GHN8892100" })).toBeVisible();

  await page.getByRole("button", { name: /Cần chú ý/ }).click();

  // Sau khi lọc: chỉ còn đơn hỏng. Số và bộ lọc phải là một, nếu
  // không người dùng thấy "1 đơn cần chú ý" rồi phải tự đi tìm.
  await expect(page.getByRole("link", { name: "GHN8892100" })).toBeVisible();
  await expect(page.getByRole("link", { name: "GHTK9023194" })).toBeHidden();
});

test("hãng chưa khai khoá hiện rõ là chưa dùng được", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/shipping");

  // Chip tình trạng kết nối nằm ngay đầu trang: "đẩy đơn không được"
  // gần như luôn là do chưa khai khoá.
  const chip = page.getByTitle(/Chưa khai: GHTK_TOKEN/);
  await expect(chip).toBeVisible();
});

test("cước hãng chốt lại khác báo giá thì hiện phần lệch", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/shipping");

  // Shop đang chịu khoản chênh này, nuốt im lặng là không ai biết.
  await expect(page.getByText(/lệch/).first()).toBeVisible();
});

test("tìm được bằng cả mã vận đơn lẫn tên khách", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/shipping");

  await page.getByPlaceholder(/Tìm mã vận đơn/).fill("8892100");
  await expect(page.getByRole("link", { name: "GHN8892100" })).toBeVisible();
  await expect(page.getByRole("link", { name: "GHN7728491" })).toBeHidden();
});

test("lọc kết hợp trạng thái và hãng, rồi đặt lại", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/shipping");

  await page.getByRole("button", { name: /^Bộ lọc/ }).click();
  await page.getByRole("button", { name: "Giá trị cho Trạng thái" }).click();
  await page.getByRole("option", { name: "Chờ lấy hàng" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Bộ lọc/ }).click();
  await page.getByRole("button", { name: "Giá trị cho Đơn vị vận chuyển" }).click();
  await page.getByRole("option", { name: "Giao Hàng Nhanh" }).click();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("link", { name: "GHN7728491" })).toBeVisible();
  await expect(page.getByRole("link", { name: "SELF1A2B3C4D" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "GHN8892100" })).toHaveCount(0);

  await page.getByRole("button", { name: /^Bộ lọc/ }).click();
  await page.getByRole("button", { name: "Đặt lại" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
});

test("sắp xếp, chọn tối đa 100 dòng mỗi trang và đổi trang", async ({ page }) => {
  const shipments = Array.from({ length: 25 }, (_, index) => ({
    ...SHIP_CHO_LAY,
    id: `ship-bulk-${index}`,
    trackingCode: `SHIP-${String(index).padStart(2, "0")}`,
    codAmount: String(100000 + index * 1000),
  }));
  await stubApi(page, { shipments });
  await page.goto("/shop/shipping");

  await expect(page.locator("tbody tr")).toHaveCount(20);
  await page.getByRole("button", { name: "Trang sau" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await page.getByLabel("Số dòng mỗi trang").selectOption("10");
  await expect(page.getByText(/Hiện 1–10 trong/)).toBeVisible();

  await page.getByRole("button", { name: "Sắp xếp danh sách" }).click();
  await page.getByRole("menuitem", { name: "Thu hộ cao → thấp" }).click();
  await expect(page.locator("tbody tr").first()).toContainText("SHIP-24");
  await page.getByLabel("Số dòng mỗi trang").selectOption("100");
  await expect(page.locator("tbody tr")).toHaveCount(25);
});

test("xuất Excel vận đơn giữ tên khách, tiền COD và cột đủ rộng", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/shipping");
  await page.getByPlaceholder(/Tìm mã vận đơn/).fill(SHIP_CHO_LAY.trackingCode);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Xuất Excel/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^van-don-\d{8}-\d{4}\.xlsx$/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await download.path())!);
  const sheet = workbook.worksheets[0];
  expect(sheet.rowCount).toBe(2);
  expect(sheet.getRow(2).getCell(1).value).toBe(SHIP_CHO_LAY.trackingCode);
  expect(sheet.getRow(2).getCell(3).value).toBe(SHIP_CHO_LAY.recipientName);
  expect(sheet.getRow(2).getCell(6).value).toBe(598000);
  expect(sheet.getColumn(3).width).toBeGreaterThan(SHIP_CHO_LAY.recipientName.length);
});

// ── Màn chi tiết ───────────────────────────────────────────────────

test("chi tiết nêu bật mốc mới nhất trên dòng thời gian", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/shipping/ship-1");

  await expect(page.getByRole("heading", { name: "GHN7728491" })).toBeVisible();
  // Mốc đầu danh sách được đánh dấu, để nhìn lướt là biết hàng ở đâu
  await expect(page.getByText("mới nhất")).toBeVisible();
  await expect(page.getByText("Tạo đơn hàng")).toBeVisible();
});

test("mã hãng chưa có trong bảng tra vẫn hiện ra chứ không giấu", async ({
  page,
}) => {
  await stubApi(page);
  await page.goto("/shop/shipping/ship-1");

  // Giấu đi thì không ai biết mà bổ sung bảng tra.
  await expect(page.getByText(/chưa có trong bảng tra: mot_ma_la/)).toBeVisible();
});

test("vận đơn chưa rời kho thì huỷ được", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/shipping/ship-1");

  await expect(page.getByRole("button", { name: "Huỷ vận đơn" })).toBeVisible();
});

test("đã lấy hàng rồi thì KHÔNG cho huỷ, và nói rõ vì sao", async ({ page }) => {
  await stubApi(page, {
    shipmentDetail: { ...SHIP_DETAIL, status: "PICKED_UP" },
  });
  await page.goto("/shop/shipping/ship-1");

  // Ẩn nút chứ không làm mờ: hàng đã trong tay hãng, đánh dấu huỷ ở
  // đây là mất dấu một kiện hàng thật.
  await expect(page.getByRole("button", { name: "Huỷ vận đơn" })).toBeHidden();
  await expect(page.getByText(/không huỷ được nữa/)).toBeVisible();
});

test("đơn tự giao mới có nút bấm tay trạng thái", async ({ page }) => {
  await stubApi(page, {
    shipmentDetail: { ...SHIP_TU_GIAO, events: [] },
  });
  await page.goto("/shop/shipping/ship-4");

  await expect(page.getByText(/trạng thái do shop bấm/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Đã lấy hàng" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Giao thành công" })).toBeHidden();
});

test("vận đơn đang chờ hãng xác minh không cho huỷ", async ({ page }) => {
  await stubApi(page, {
    shipmentDetail: { ...SHIP_TU_GIAO, status: "REQUESTED", events: [] },
  });
  await page.goto("/shop/shipping/ship-4");
  await expect(page.getByRole("button", { name: "Huỷ vận đơn" })).toBeHidden();
});

test("đơn đi hãng thật KHÔNG có nút bấm tay", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/shipping/ship-1");

  await expect(page.getByRole("button", { name: "Đã lấy hàng" })).toBeHidden();
});

// ── Trang theo dõi công khai ───────────────────────────────────────

test("trang theo dõi của khách chỉ hiện thông tin đã che bớt", async ({
  page,
}) => {
  await stubApi(page);
  await page.goto("/tracking/tok-abcdef0123456789abcdef");

  await expect(page.getByText("Đang vận chuyển").first()).toBeVisible();
  await expect(page.getByText("Nguyễn Thuỳ T.")).toBeVisible();
  await expect(page.getByText("0984***899")).toBeVisible();

  // Ai cầm link cũng xem được, nên không bày ra số nhà hay tiền nong.
  await expect(page.getByText(/Lê Duẩn/)).toBeHidden();
  await expect(page.getByText(/598\.000/)).toBeHidden();
});

test("chưa có mã bưu gửi thì nói đang chuẩn bị, không để trang trống", async ({
  page,
}) => {
  await stubApi(page, { tracking: TRACKING_CHUA_CO_MA });
  await page.goto("/tracking/tok-abcdef0123456789abcdef");

  await expect(page.getByText(/đang chuẩn bị hàng/i)).toBeVisible();
});

test("token sai hiện đúng một câu, không nói gì thêm", async ({ page }) => {
  await stubApi(page, { tracking: null });
  await page.goto("/tracking/tok-sai");

  await expect(
    page.getByRole("heading", { name: "Không tìm thấy đơn hàng" }),
  ).toBeVisible();
  // Không phân biệt "sai" với "hết hạn": nói ra là mách cho người dò
  // biết họ đoán đúng một nửa.
  await expect(page.getByText(/hết hạn hoặc bị sao chép thiếu/)).toBeVisible();
});

// ── Tạo vận đơn từ màn đơn hàng ────────────────────────────────────

test("đơn NHÁP thì chưa đẩy sang hãng được", async ({ page }) => {
  await stubApi(page, {
    orderDetail: { ...ORDER_DETAIL, status: "DRAFT" },
  });
  await page.goto("/shop/orders/LIVE-20261010-abc123");

  // Chờ trang dựng xong rồi mới khẳng định nút vắng mặt: toBeHidden()
  // cũng đúng khi phần tử chưa kịp xuất hiện, nên thiếu bước này là
  // ca test đậu giả.
  await expect(page.getByRole("button", { name: "In phiếu giao" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo vận đơn" })).toBeHidden();
});

test("hộp thoại tạo vận đơn không hiện mã trước khi tạo", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/orders/LIVE-20261010-abc123");

  await page.getByRole("button", { name: "Tạo vận đơn" }).click();

  await expect(page.getByLabel("Đơn vị vận chuyển")).toBeVisible();
  // Mã do hãng cấp sau khi nhận đơn — in trước là hãng không quét được
  await expect(page.getByText(/chỉ in được ở màn chi tiết/)).toBeVisible();
});

test("hãng chưa khai khoá bị để mờ trong hộp thoại", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/orders/LIVE-20261010-abc123");
  await page.getByRole("button", { name: "Tạo vận đơn" }).click();

  // Để mờ chứ không ẩn: shop cần biết có lựa chọn đó và thiếu gì để
  // bật nó lên.
  const chon = page.getByLabel("Đơn vị vận chuyển");
  await expect(
    chon.locator("option", { hasText: "Giao Hàng Tiết Kiệm" }),
  ).toBeDisabled();
  await expect(
    chon.locator("option", { hasText: "Giao Hàng Nhanh" }),
  ).toBeEnabled();
});
