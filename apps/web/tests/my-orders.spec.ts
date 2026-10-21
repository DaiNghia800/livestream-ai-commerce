import { expect, test, type Page } from "@playwright/test";

/**
 * Màn "Đơn mua": tab theo trạng thái, mỗi đơn một thẻ, đơn chờ xác
 * nhận có nút đưa thẳng tới link xác nhận.
 */

const DON = [
  {
    id: "o-1", orderCode: "LIVE-20261022-aaa111", status: "PENDING_CONFIRMATION", totalAmount: "500000.00",
    createdAt: "2026-10-22T10:00:00Z", confirmToken: "tok-aaa", livestreamTitle: "Xả kho linen",
    recipientName: null, shippingAddress: null,
    items: [{ productName: "Áo sơ mi lụa", variantName: "Be · L", skuCode: "AO-L", quantity: 2, unitPrice: "250000.00", imageUrl: null }],
    payment: null, shipment: null,
  },
  {
    id: "o-2", orderCode: "LIVE-20261021-bbb222", status: "SHIPPING", totalAmount: "199000.00",
    createdAt: "2026-10-21T10:00:00Z", confirmToken: "tok-bbb", livestreamTitle: null,
    recipientName: "Lê Trần Tiến", shippingAddress: "88 Trần Phú",
    items: [{ productName: "Váy hai dây", variantName: "Đen · M", skuCode: "VAY-M", quantity: 1, unitPrice: "199000.00", imageUrl: null }],
    payment: { method: "COD", status: "PENDING" }, shipment: { status: "IN_TRANSIT", trackingCode: "GHN123", trackingToken: "trk-1" },
  },
];

async function dungTrang(page: Page, daDangNhap: boolean) {
  await page.route("**/api/me/orders**", (r) => {
    const group = new URL(r.request().url()).searchParams.get("group");
    const items = group === "CHO_XAC_NHAN" ? [DON[0]] : group === "DANG_GIAO" ? [DON[1]] : group ? [] : DON;
    return r.fulfill({ json: { items } });
  });
  await page.addInitScript((co: boolean) => {
    if (co) {
      localStorage.setItem("access_token", "token-gia");
      localStorage.setItem("auth_user", JSON.stringify({ full_name: "Lê Trần Tiến", email: "tien@example.com" }));
    } else {
      localStorage.removeItem("access_token");
      localStorage.removeItem("auth_user");
    }
  }, daDangNhap);
  await page.goto("/orders");
}

test("liệt kê đơn với trạng thái, hàng hoá, thành tiền và nút đúng loại", async ({ page }) => {
  await dungTrang(page, true);

  const the = page.getByTestId("don-mua");
  await expect(the).toHaveCount(2);

  const choXacNhan = the.nth(0);
  await expect(choXacNhan).toContainText("Phiên “Xả kho linen”");
  await expect(choXacNhan).toContainText("LIVE-20261022-aaa111");
  await expect(choXacNhan).toContainText("Chờ xác nhận");
  await expect(choXacNhan).toContainText("Áo sơ mi lụa");
  await expect(choXacNhan).toContainText("x2");
  await expect(choXacNhan).toContainText("Thành tiền (2 sản phẩm)");
  await expect(choXacNhan.getByRole("link", { name: "Xác nhận đơn" })).toHaveAttribute("href", "/confirm/tok-aaa");

  const dangGiao = the.nth(1);
  await expect(dangGiao).toContainText("Đang giao hàng");
  await expect(dangGiao).toContainText("Thanh toán khi nhận hàng · Chờ thanh toán");
  await expect(dangGiao.getByRole("link", { name: "Theo dõi vận đơn" })).toHaveAttribute("href", "/tracking/trk-1");
  await expect(dangGiao.getByRole("link", { name: "Xem đơn" })).toHaveAttribute("href", "/confirm/tok-bbb");
});

test("tab lọc theo nhóm trạng thái và gửi đúng tham số", async ({ page }) => {
  await dungTrang(page, true);

  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes("/me/orders?group=CHO_XAC_NHAN")),
    page.getByRole("tab", { name: "Chờ xác nhận" }).click(),
  ]);
  expect(req.method()).toBe("GET");
  await expect(page.getByTestId("don-mua")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "Chờ xác nhận" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "Hoàn thành" }).click();
  await expect(page.getByText("Không có đơn nào ở trạng thái này.")).toBeVisible();
});

test("chưa đăng nhập thì mời đăng nhập, không gọi API", async ({ page }) => {
  let goi = 0;
  page.on("request", (r) => { if (r.url().includes("/me/orders")) goi += 1; });
  await dungTrang(page, false);
  await expect(page.getByRole("heading", { name: "Đăng nhập để xem đơn mua" })).toBeVisible();
  expect(goi).toBe(0);
});

test("menu tài khoản có mục Đơn mua dẫn tới /orders", async ({ page }) => {
  await dungTrang(page, true);
  await page.getByRole("button", { name: "Tài khoản của tôi" }).click();
  await page.getByRole("menuitem", { name: "Đơn mua" }).click();
  await expect(page).toHaveURL(/\/orders$/);
});
