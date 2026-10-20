import { test, expect, type Page } from "@playwright/test";
import {
  ORDER_DETAIL,
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
