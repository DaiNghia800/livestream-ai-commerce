import { expect, test, type Page } from "@playwright/test";

/** Bảng giá vận chuyển giả: shop tự giao miễn phí và GHN 30.000đ. */
const BANG_GIA = {
  weightGram: 1000,
  items: [
    { carrier: "self", carrierLabel: "Shop tự giao", serviceCode: "self", fee: "0", etaText: "Shop liên hệ hẹn giao" },
    { carrier: "ghn", carrierLabel: "Giao Hàng Nhanh", serviceCode: "2", fee: "30000", etaText: "2 - 3 ngày" },
  ],
};

async function stubBangGia(page: Page, dem: { lan: number }) {
  await page.route("**/api/orders/confirm/test-token/shipping-options", async (route) => {
    dem.lan += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toMatchObject({ provinceName: "TP. Hồ Chí Minh", wardCode: "26743" });
    await route.fulfill({ json: BANG_GIA });
  });
}

test("customer confirms an order and starts a test bank transfer", async ({ page }) => {
  const expires = new Date(Date.now() + 10 * 60_000).toISOString();
  const base = {
    id: "order-1",
    orderCode: "LIVE-TEST-123",
    totalAmount: "250000.00",
    heldUntil: expires,
    recipientName: null,
    recipientPhone: null,
    shippingAddress: null,
    addressNormalized: false,
    items: [{ id: "item-1", skuId: "1", skuCode: "AO-L", productName: "Áo linen", quantity: 2, requestedQty: 3, isPartial: true, unitPrice: "125000.00" }],
  };
  let confirmed = false;
  let paymentCreated = false;
  const demBangGia = { lan: 0 };
  await stubBangGia(page, demBangGia);
  await page.route("**/api/shipments/provinces", (route) => route.fulfill({ json: { items: ["Hà Nội", "TP. Hồ Chí Minh"] } }));
  await page.route("**/api/shipments/wards-current?province=*", (route) => route.fulfill({ json: { items: [{ code: "26743", name: "Phường Bến Thành" }] } }));
  await page.route("**/api/orders/confirm/test-token", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({
        recipientName: "Nguyễn An", recipientPhone: "0901234567",
        provinceName: "TP. Hồ Chí Minh", wardCode: "26743", streetLine: "12 Nguyễn Huệ",
      });
      expect(body).not.toHaveProperty("shippingAddress");
      // Khách đã đổi từ dòng rẻ nhất (tự giao) sang GHN: gửi đúng giá đã thấy.
      expect(body.shippingOption).toEqual({ carrier: "ghn", serviceCode: "2", fee: "30000" });
      confirmed = true;
      await route.fulfill({ json: {
        ...base, ...body, status: "CONFIRMED", addressNormalized: true, heldUntil: null,
        totalAmount: "280000.00", shippingCarrier: "ghn", shippingServiceCode: "2", shippingFee: "30000.00",
      } });
      return;
    }
    await route.fulfill({ json: { ...base, status: confirmed ? "CONFIRMED" : "PENDING_CONFIRMATION", ...(confirmed ? {
      recipientName: "Nguyễn An", recipientPhone: "0901234567", shippingAddress: "12 Nguyễn Huệ, Phường Bến Thành, TP. Hồ Chí Minh",
      addressNormalized: true, heldUntil: null,
      totalAmount: "280000.00", shippingCarrier: "ghn", shippingServiceCode: "2", shippingFee: "30000.00",
    } : {}) } });
  });
  await page.route("**/api/payments/customer/confirm/test-token", (route) => {
    if (route.request().method() === "POST") paymentCreated = true;
    return route.fulfill({ json: paymentCreated ? {
      available: true, reason: null, status: "PENDING", amount: "250000.00", paidAmount: "0",
      txnRef: "LIVETEST123", bankCode: "Vietcombank", accountNumber: "1234567890",
      accountName: "TEST ACCOUNT", qrUrl: "https://vietqr.app/img?acc=1234567890&bank=Vietcombank&amount=250000&des=LIVETEST123", sandbox: true,
    } : {
      available: true, reason: null, status: null, amount: null, paidAmount: null,
      txnRef: null, bankCode: null, accountNumber: null, accountName: null, qrUrl: null, sandbox: true,
    } });
  });

  await page.goto("/confirm/test-token");
  await expect(page.getByText("Bạn chọn 3, lúc chốt shop chỉ còn 2.")).toBeVisible();
  await page.getByLabel("Họ và tên người nhận").fill("Nguyễn An");
  await page.getByLabel("Số điện thoại").fill("0901234567");
  await expect(page.getByRole("button", { name: "Chọn phường/xã" })).toBeDisabled();
  await page.getByRole("button", { name: "Chọn tỉnh/thành" }).click();
  await page.getByRole("button", { name: "TP. Hồ Chí Minh" }).click();
  await page.getByRole("button", { name: "Chọn phường/xã" }).click();
  await page.getByRole("button", { name: "Phường Bến Thành" }).click();
  await page.getByRole("button", { name: "Chọn tỉnh/thành" }).click();
  await page.getByRole("button", { name: "Hà Nội" }).click();
  await expect(page.getByRole("button", { name: "Chọn phường/xã" })).toHaveText("Chọn phường/xã");
  await page.getByRole("button", { name: "Chọn tỉnh/thành" }).click();
  await page.getByRole("button", { name: "TP. Hồ Chí Minh" }).click();
  await page.getByRole("button", { name: "Chọn phường/xã" }).click();
  await page.getByRole("button", { name: "Phường Bến Thành" }).click();
  // Chưa đủ địa chỉ thì chưa hỏi giá.
  await expect(page.getByText("Chọn địa chỉ nhận hàng để xem phí vận chuyển.")).toBeVisible();
  await page.getByLabel("Số nhà, tên đường").fill("12 Nguyễn Huệ");

  // Bảng giá về: dòng rẻ nhất được chọn sẵn, tổng chưa cộng ship.
  const nhomShip = page.getByRole("radiogroup", { name: "Phương thức vận chuyển" });
  await expect(nhomShip.getByRole("radio")).toHaveCount(2);
  await expect(nhomShip.getByRole("radio", { name: /Shop tự giao/ })).toBeChecked();
  await expect(page.getByTestId("tong-thanh-toan")).toHaveText(/250\.000/);

  // Chọn GHN: phí và tổng đổi theo ngay, trước khi bấm xác nhận.
  await nhomShip.getByRole("radio", { name: /Giao Hàng Nhanh/ }).check();
  await expect(page.getByTestId("phi-van-chuyen")).toContainText("30.000");
  await expect(page.getByTestId("tong-thanh-toan")).toHaveText(/280\.000/);

  await page.getByRole("button", { name: "Xác nhận đơn hàng" }).click();
  await expect(page.getByText("Đơn đã được xác nhận.", { exact: false })).toBeVisible();
  await expect(page.getByText("12 Nguyễn Huệ, Phường Bến Thành, TP. Hồ Chí Minh")).toBeVisible();
  // Sau xác nhận: dịch vụ đã chọn và tổng đã gồm ship đọc từ server.
  await expect(page.getByText("Giao Hàng Nhanh · 30.000", { exact: false })).toBeVisible();
  await expect(page.getByTestId("tong-thanh-toan")).toHaveText(/280\.000/);
  await page.getByRole("button", { name: "Thanh toán chuyển khoản" }).click();
  await expect(page.getByText("LIVETEST123")).toBeVisible();
  await expect(page.getByText("1234567890")).toBeVisible();
  await expect(page.getByAltText("Mã QR chuyển khoản thử nghiệm")).toBeVisible();
});

test("shipping fee changed on the server: 409 shows the new fee and reloads the table", async ({ page }) => {
  const base = {
    id: "order-9", orderCode: "LIVE-FEE", status: "PENDING_CONFIRMATION", totalAmount: "250000.00", heldUntil: null,
    recipientName: null, recipientPhone: null, shippingAddress: null, addressNormalized: false,
    items: [{ id: "item-1", skuId: "1", skuCode: "AO-L", productName: "Áo linen", quantity: 2, requestedQty: 2, isPartial: false, unitPrice: "125000.00" }],
  };
  const demBangGia = { lan: 0 };
  await stubBangGia(page, demBangGia);
  await page.route("**/api/shipments/provinces", (route) => route.fulfill({ json: { items: ["TP. Hồ Chí Minh"] } }));
  await page.route("**/api/shipments/wards-current?province=*", (route) => route.fulfill({ json: { items: [{ code: "26743", name: "Phường Bến Thành" }] } }));
  await page.route("**/api/orders/confirm/test-token", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 409, json: {
        error: "ShippingQuoteChanged", message: "đổi giá", carrier: "ghn", serviceCode: "2",
        expectedFee: "30000", actualFee: "35000",
      } });
      return;
    }
    await route.fulfill({ json: base });
  });

  await page.goto("/confirm/test-token");
  await page.getByLabel("Họ và tên người nhận").fill("Nguyễn An");
  await page.getByLabel("Số điện thoại").fill("0901234567");
  await page.getByRole("button", { name: "Chọn tỉnh/thành" }).click();
  await page.getByRole("button", { name: "TP. Hồ Chí Minh" }).click();
  await page.getByRole("button", { name: "Chọn phường/xã" }).click();
  await page.getByRole("button", { name: "Phường Bến Thành" }).click();
  await page.getByLabel("Số nhà, tên đường").fill("12 Nguyễn Huệ");
  const nhomShip = page.getByRole("radiogroup", { name: "Phương thức vận chuyển" });
  await nhomShip.getByRole("radio", { name: /Giao Hàng Nhanh/ }).check();
  const truoc = demBangGia.lan;

  await page.getByRole("button", { name: "Xác nhận đơn hàng" }).click();
  // Lọc theo chữ: Next.js cũng gắn một role=alert cho bộ đọc đường dẫn.
  const loi = page.getByRole("alert").filter({ hasText: "Phí vận chuyển vừa thay đổi" });
  await expect(loi).toBeVisible();
  await expect(loi).toContainText("35.000");
  // Bảng giá được hỏi lại để khách chọn trên con số mới.
  await expect.poll(() => demBangGia.lan).toBeGreaterThan(truoc);
});

test("expired reservation does not offer confirmation", async ({ page }) => {
  await page.route("**/api/orders/confirm/test-token", (route) => route.fulfill({ json: {
    id: "order-2", orderCode: "LIVE-EXPIRED", status: "EXPIRED", totalAmount: "100000.00", heldUntil: null,
    recipientName: null, recipientPhone: null, shippingAddress: null, addressNormalized: false, items: [],
  } }));
  await page.goto("/confirm/test-token");
  await expect(page.getByText("Đơn này đã đóng.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xác nhận đơn hàng" })).toHaveCount(0);
});

// Cổng thanh toán đưa trình duyệt về /confirm/<token>?thanhToan=ok|loi.
// Banner chỉ là lời cổng nói; trạng thái đơn vẫn đọc từ server.
for (const ca of [
  { thanhToan: "ok", thay: "Cổng báo thanh toán thành công.", khongThay: "Đơn đang chờ thanh toán." },
  { thanhToan: "loi", thay: "Thanh toán không thành công hoặc đã bị huỷ ở cổng.", khongThay: "Cổng báo thanh toán thành công." },
]) {
  test(`gateway return with thanhToan=${ca.thanhToan} shows the matching banner`, async ({ page }) => {
    await page.route("**/api/orders/confirm/test-token", (route) => route.fulfill({ json: {
      id: "order-3", orderCode: "LIVE-AWAIT", status: "AWAITING_PAYMENT", totalAmount: "199000.00", heldUntil: null,
      recipientName: "Nguyễn An", recipientPhone: "0901234567", shippingAddress: "12 Nguyễn Huệ, TP. Hồ Chí Minh",
      addressNormalized: true, items: [{ id: "item-1", skuId: "1", skuCode: "AO-L", productName: "Áo linen", quantity: 1, requestedQty: 1, isPartial: false, unitPrice: "199000.00" }],
    } }));
    await page.route("**/api/payments/customer/confirm/test-token/status", (route) => route.fulfill({ json: {
      method: "ONLINE", status: "PENDING", amount: "199000.00", paidAmount: "0.00",
    } }));
    await page.route("**/api/payments/customer/confirm/test-token/gateways", (route) => route.fulfill({ json: {
      items: [{ name: "mock", label: "Cổng giả (môi trường thử)", ready: true, missing: [] }],
    } }));
    await page.route("**/api/payments/customer/confirm/test-token", (route) => route.fulfill({ json: {
      available: false, reason: "UNCONFIGURED", status: null, amount: null, paidAmount: null,
      txnRef: null, bankCode: null, accountNumber: null, accountName: null, qrUrl: null, sandbox: true,
    } }));

    await page.goto(`/confirm/test-token?thanhToan=${ca.thanhToan}`);
    await expect(page.getByText(ca.thay, { exact: false })).toBeVisible();
    await expect(page.getByText(ca.khongThay, { exact: false })).toHaveCount(0);
    // Vẫn chọn được cổng để trả (lại).
    await expect(page.getByRole("button", { name: /Tiếp tục|Thanh toán/ })).toBeVisible();
  });
}
