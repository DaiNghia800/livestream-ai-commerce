import { expect, test, type Page } from "@playwright/test";

/**
 * Mua bằng nút trên trang live, theo nhịp TikTok Shop:
 *   Chọn phân loại → "Mua ngay" → màn Thanh toán (sổ địa chỉ, sản phẩm, vận
 *   chuyển, cách trả, lời nhắn, tổng) → Đặt hàng → kết quả (COD: thành công;
 *   online: bước thanh toán).
 * Khách đã đăng nhập đi đường này với đơn thật; khách vãng lai vẫn gõ tay
 * trong sheet cũ. Backend được giả lập hoàn toàn.
 */

const LIVE_ID = "f1524476-ab92-40c7-b7ec-e61f946b87a9";
const NOW = "2026-11-02T10:00:00.000Z";

const LIVE_ITEM = {
  id: LIVE_ID, merchantId: "a0000000-0000-0000-0000-000000000001", title: "Phiên kiểm thử nút mua",
  description: null, coverImageKey: null, status: "live", channelArn: null, playbackUrl: null, replayUrl: null,
  scheduledAt: null, startedAt: NOW, endedAt: null, createdAt: NOW, updatedAt: NOW, productCount: 1,
};
const PRODUCT = {
  id: "lp-1", livestreamId: LIVE_ID, productId: "31", variantId: null, displayOrder: 1, isFeatured: true,
  createdAt: NOW, productName: "Áo thun A12", productCode: "A12", skuCode: "A12-DEN-M", variantName: "Đen / M",
  price: 199000, imageUrl: null,
};
const DIA_CHI = [
  {
    id: "dc-1", recipientName: "Đạt Lê", recipientPhone: "0989541246",
    provinceName: "Cần Thơ", wardCode: "92001", wardName: "Phường Hưng Phú",
    streetLine: "12 Nguyễn Huệ, khu dân cư Hưng Phú 1 dãy nhà số 3", label: "HOME", isDefault: true,
    createdAt: "2026-10-20T00:00:00Z",
  },
  {
    id: "dc-2", recipientName: "Lê Văn Tiến", recipientPhone: "0909000111",
    provinceName: "Thành phố Hồ Chí Minh", wardCode: "79001", wardName: "Phường Bến Nghé",
    streetLine: "1 Hùng Vương", label: "OFFICE", isDefault: false, createdAt: "2026-10-21T00:00:00Z",
  },
];
const CART = {
  id: "o-1", orderCode: "LIVE-20261102-abc123", status: "DRAFT", totalAmount: "199000.00",
  recipientName: null, recipientPhone: null, shippingAddress: null, addressNormalized: false,
  livestreamTitle: LIVE_ITEM.title, confirmToken: "tok-1",
  items: [{ id: "it-1", skuId: "7", skuCode: "A12-DEN-M", productName: "Áo thun A12", quantity: 1, requestedQty: 1,
    isPartial: false, unitPrice: "199000.00", variantName: "Đen / M", imageUrl: null }],
};

type Stub = {
  live: boolean;
  diaChi: typeof DIA_CHI | null;
  goiDat?: (body: unknown) => void;
  /** Trạng thái đơn trả về cho các lần hỏi lại sau khi đặt (online). */
  trangThaiSau?: string[];
};

async function stubBackend(page: Page, stub: Stub) {
  const trangThaiSau = [...(stub.trangThaiSau ?? [])];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const p = u.pathname;
    if (p === "/api/orders/confirm/tok-1" && req.method() === "GET") {
      const status = trangThaiSau.length > 1 ? trangThaiSau.shift()! : trangThaiSau[0] ?? "AWAITING_PAYMENT";
      return route.fulfill({ json: { ...CART, status, cancelReason: status === "CANCELLED" ? "OUT_OF_STOCK_AT_PAYMENT" : null } });
    }
    if (p === "/api/me/addresses") return route.fulfill({ json: { items: stub.diaChi ?? [] } });
    if (stub.live && p === "/api/livestreams") {
      return route.fulfill({ json: { items: [LIVE_ITEM], total: 1, page: 1, limit: 10, totalPages: 1 } });
    }
    if (stub.live && p === `/api/livestreams/${LIVE_ID}`) {
      return route.fulfill({ json: { ...LIVE_ITEM, products: [PRODUCT] } });
    }
    if (stub.live && p === `/api/livestreams/${LIVE_ID}/products`) {
      return route.fulfill({ json: { data: [PRODUCT], total: 1 } });
    }
    if (p === "/api/me/cart/items" && req.method() === "POST") {
      stub.goiDat?.(req.postDataJSON());
      return route.fulfill({ status: 201, json: { cart: CART, rejected: [] } });
    }
    if (p === "/api/orders/confirm/tok-1" && req.method() === "POST") {
      const body = req.postDataJSON() as { paymentMethod?: string };
      stub.goiDat?.(body);
      // Online: server trả AWAITING_PAYMENT (chưa giữ hàng); COD: CONFIRMED.
      return route.fulfill({ json: { ...CART, status: body.paymentMethod === "ONLINE" ? "AWAITING_PAYMENT" : "CONFIRMED",
        recipientName: "Đạt Lê", recipientPhone: "0989541246",
        shippingAddress: "12 Nguyễn Huệ, khu dân cư Hưng Phú 1 dãy nhà số 3, Phường Hưng Phú, Cần Thơ" } });
    }
    if (p === "/api/payments/customer/confirm/tok-1/gateways") {
      return route.fulfill({ json: { items: [{ name: "mock", label: "Cổng giả (môi trường thử)", ready: true, missing: [] }] } });
    }
    if (p === "/api/payments/customer/confirm/tok-1/transfer") {
      return route.fulfill({ json: { available: false, reason: "UNCONFIGURED", status: null, amount: null, paidAmount: null,
        txnRef: null, bankCode: null, accountNumber: null, accountName: null, qrUrl: null, sandbox: true } });
    }
    return route.fulfill({ status: 503, json: { error: "Unavailable" } });
  });
}

async function dangNhap(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("access_token", "tok-e2e");
    localStorage.setItem("auth_user", JSON.stringify({ id: 7, full_name: "Đạt Lê", email: "dat@example.com" }));
  });
}

/** Mở sheet "Chọn phân loại" của sản phẩm đầu tiên (chờ trang hydrate xong). */
async function moSheetPhanLoai(page: Page) {
  await page.goto("/");
  const mua = page.getByRole("button", { name: /^(Mua ngay|Đặt Mua)/i }).first();
  await mua.waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await mua.click();
  const sheet = page.getByRole("dialog").filter({ hasText: "Đặt hàng nhanh" });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Từ sheet phân loại sang màn Thanh toán (khách đã đăng nhập). */
async function sangManThanhToan(page: Page) {
  const sheet = await moSheetPhanLoai(page);
  await expect(page.locator("#quick-order-name")).toHaveCount(0);
  await sheet.getByTestId("mua-ngay-thanh-toan").click();
  const man = page.getByTestId("live-checkout");
  await expect(man).toBeVisible();
  return man;
}

test("đã đăng nhập, phiên thật: màn Thanh toán đủ các bước; online → chờ tiền về mới báo thành công", async ({ page }) => {
  const goi: unknown[] = [];
  await dangNhap(page);
  // Lần hỏi đầu còn chờ, lần sau tiền đã về (server giữ hàng → CONFIRMED).
  await stubBackend(page, { live: true, diaChi: DIA_CHI, goiDat: (b) => goi.push(b), trangThaiSau: ["AWAITING_PAYMENT", "CONFIRMED"] });
  const man = await sangManThanhToan(page);

  // 1. Địa chỉ từ sổ (mặc định), 2. sản phẩm, 3. vận chuyển, 4. cách trả, 6. tổng
  const dong = man.getByTestId("dia-chi-nhan-hang");
  await expect(dong).toContainText("Đạt Lê");
  await expect(dong).toContainText("12 Nguyễn Huệ, khu dân cư Hưng Phú 1 dãy nhà số 3, Phường Hưng Phú, Cần Thơ");
  await expect(man.getByText("Áo thun A12")).toBeVisible();
  await expect(man.getByText("Giao hàng tiêu chuẩn")).toBeVisible();
  await expect(man.getByRole("radio", { name: /Thanh toán khi nhận hàng/ })).toBeChecked();
  await expect(man.getByText("Tổng cộng")).toBeVisible();

  // Thay đổi địa chỉ ngay trong màn Thanh toán
  await dong.getByRole("button", { name: "Thay đổi" }).click();
  const popup = page.getByRole("dialog").last();
  await popup.getByRole("radio", { name: /1 Hùng Vương/ }).check();
  await popup.getByRole("button", { name: "Xác nhận" }).click();
  await expect(dong).toContainText("Lê Văn Tiến");

  await man.getByRole("radio", { name: /Thanh toán online/ }).check();
  await man.getByRole("button", { name: "Đặt hàng" }).click();

  const ketQua = page.getByTestId("live-checkout-ket-qua");
  await expect(ketQua).toBeVisible();
  // Chưa thành công: đơn chờ thanh toán, hàng chưa giữ, hiện cổng để trả.
  await expect(page.getByRole("heading", { name: "Chờ thanh toán" })).toBeVisible();
  await expect(ketQua).toContainText("mời bạn thanh toán");
  await expect(ketQua).toContainText("chưa được giữ");
  await expect(ketQua).toContainText("LIVE-20261102-abc123");
  await expect(ketQua).toContainText("1 Hùng Vương, Phường Bến Nghé, Thành phố Hồ Chí Minh");
  await expect(ketQua.getByTestId("buoc-thanh-toan")).toContainText("Cổng giả");
  // Chưa cấu hình chuyển khoản thì không in "shop chưa cấu hình" cho khách.
  await expect(ketQua.getByText(/chưa cấu hình/)).toHaveCount(0);

  // Tiền về: server đã giữ hàng → giờ mới là thành công, cổng biến mất.
  await expect(ketQua).toContainText("Thanh toán thành công, hàng đã được giữ!", { timeout: 15000 });
  await expect(ketQua.getByTestId("buoc-thanh-toan")).toHaveCount(0);

  // Đơn thật: thêm vào giỏ server với SKU của phiên, rồi xác nhận bằng địa chỉ đã chọn + ONLINE.
  expect(goi[0]).toMatchObject({ livestreamId: LIVE_ID, skuCode: "A12-DEN-M", quantity: 1 });
  expect(goi[1]).toMatchObject({ recipientName: "Lê Văn Tiến", streetLine: "1 Hùng Vương", paymentMethod: "ONLINE" });
});

test("online nhưng hết hàng lúc tiền về: báo huỷ và hoàn tiền", async ({ page }) => {
  await dangNhap(page);
  await stubBackend(page, { live: true, diaChi: DIA_CHI, trangThaiSau: ["AWAITING_PAYMENT", "CANCELLED"] });
  const man = await sangManThanhToan(page);
  await man.getByRole("radio", { name: /Thanh toán online/ }).check();
  await man.getByRole("button", { name: "Đặt hàng" }).click();
  const ketQua = page.getByTestId("live-checkout-ket-qua");
  await expect(ketQua).toContainText("Hết hàng đúng lúc tiền về", { timeout: 15000 });
  await expect(ketQua).toContainText("hoàn lại số tiền");
  await expect(ketQua.getByTestId("buoc-thanh-toan")).toHaveCount(0);
});

test("COD: đặt hàng thành công, có link xem đơn", async ({ page }) => {
  await dangNhap(page);
  await stubBackend(page, { live: true, diaChi: DIA_CHI });
  const man = await sangManThanhToan(page);
  await man.getByRole("button", { name: "Đặt hàng" }).click();
  // exact: tiêu đề hộp thoại là "Đặt hàng thành công", h4 bên trong là "…!".
  await expect(page.getByRole("heading", { name: "Đặt hàng thành công", exact: true })).toBeVisible();
  await expect(page.getByTestId("live-checkout-ket-qua").getByTestId("buoc-thanh-toan")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Xem đơn hàng" })).toHaveAttribute("href", "/orders");
});

test("sổ địa chỉ trống: mời thêm địa chỉ và khoá nút Đặt hàng", async ({ page }) => {
  await dangNhap(page);
  await stubBackend(page, { live: true, diaChi: null });
  const man = await sangManThanhToan(page);
  await expect(man.getByText("Bạn chưa có địa chỉ nhận hàng.")).toBeVisible();
  await expect(man.getByRole("button", { name: "Thêm địa chỉ" })).toBeVisible();
  await expect(man.getByRole("button", { name: "Đặt hàng" })).toBeDisabled();
});

test("phiên demo (không có backend): báo rõ và không cho đặt", async ({ page }) => {
  await dangNhap(page);
  await stubBackend(page, { live: false, diaChi: DIA_CHI });
  const man = await sangManThanhToan(page);
  await expect(man.getByText(/phiên demo/)).toBeVisible();
  await expect(man.getByRole("button", { name: "Đặt hàng" })).toBeDisabled();
});

test("khách vãng lai vẫn gõ tay họ tên, SĐT, địa chỉ trong sheet cũ", async ({ page }) => {
  await stubBackend(page, { live: false, diaChi: null });
  const sheet = await moSheetPhanLoai(page);
  await expect(page.locator("#quick-order-name")).toBeVisible();
  await expect(page.locator("#quick-order-phone")).toBeVisible();
  await expect(page.locator("#quick-order-address")).toBeVisible();
  await expect(sheet.getByTestId("mua-ngay-thanh-toan")).toHaveCount(0);
});
