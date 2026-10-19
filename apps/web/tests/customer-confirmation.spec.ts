import { expect, test } from "@playwright/test";

test("customer confirms an order and sees the saved delivery details", async ({ page }) => {
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
  await page.route("**/api/orders/confirm/test-token", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({ recipientName: "Nguyễn An", recipientPhone: "0901234567" });
      confirmed = true;
      await route.fulfill({ json: { ...base, ...body, status: "CONFIRMED", addressNormalized: true, heldUntil: null } });
      return;
    }
    await route.fulfill({ json: { ...base, status: confirmed ? "CONFIRMED" : "PENDING_CONFIRMATION", ...(confirmed ? { recipientName: "Nguyễn An", recipientPhone: "0901234567", shippingAddress: "12 Nguyễn Huệ, phường Sài Gòn, TP Hồ Chí Minh", addressNormalized: true, heldUntil: null } : {}) } });
  });

  await page.goto("/confirm/test-token");
  await expect(page.getByText("Bạn chọn 3, shop chỉ giữ được 2.")).toBeVisible();
  await page.getByLabel("Họ và tên người nhận").fill("Nguyễn An");
  await page.getByLabel("Số điện thoại").fill("0901234567");
  await page.getByLabel("Địa chỉ giao hàng").fill("12 Nguyễn Huệ, phường Sài Gòn, TP Hồ Chí Minh");
  await page.getByRole("button", { name: "Xác nhận đơn hàng" }).click();
  await expect(page.getByText("Đơn đã được xác nhận.", { exact: false })).toBeVisible();
  await expect(page.getByText("12 Nguyễn Huệ, phường Sài Gòn, TP Hồ Chí Minh")).toBeVisible();
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
