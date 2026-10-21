import { expect, test } from "@playwright/test";

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
      confirmed = true;
      await route.fulfill({ json: { ...base, ...body, status: "CONFIRMED", addressNormalized: true, heldUntil: null } });
      return;
    }
    await route.fulfill({ json: { ...base, status: confirmed ? "CONFIRMED" : "PENDING_CONFIRMATION", ...(confirmed ? { recipientName: "Nguyễn An", recipientPhone: "0901234567", shippingAddress: "12 Nguyễn Huệ, Phường Bến Thành, TP. Hồ Chí Minh", addressNormalized: true, heldUntil: null } : {}) } });
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
  await page.getByLabel("Số nhà, tên đường").fill("12 Nguyễn Huệ");
  await page.getByRole("button", { name: "Xác nhận đơn hàng" }).click();
  await expect(page.getByText("Đơn đã được xác nhận.", { exact: false })).toBeVisible();
  await expect(page.getByText("12 Nguyễn Huệ, Phường Bến Thành, TP. Hồ Chí Minh")).toBeVisible();
  await page.getByRole("button", { name: "Thanh toán chuyển khoản" }).click();
  await expect(page.getByText("LIVETEST123")).toBeVisible();
  await expect(page.getByText("1234567890")).toBeVisible();
  await expect(page.getByAltText("Mã QR chuyển khoản thử nghiệm")).toBeVisible();
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
