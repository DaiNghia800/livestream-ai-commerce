import { expect, test, type Page } from "@playwright/test";

// 2026-11-02: trang chủ chuyển sang trang live của nhánh dev (CustomerLiveView,
// giỏ hàng trong localStorage). CustomerLiveConnected + CartDrawer không còn
// được mount ở route nào; giữ spec này để dùng lại khi nối giỏ server-side
// vào trang live mới.
test.skip(true, "CustomerLiveConnected không còn ở '/', chờ nối giỏ server vào trang live dev");

/**
 * Giỏ hàng trong phiên live: AI chốt từ bình luận → toast + huy hiệu,
 * ngăn kéo bên phải để xem/sửa, và xác nhận mua ngay trong ngăn kéo.
 */

const LIVE_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "tok-gio";

const PHIEN = {
  id: LIVE_ID, merchantId: "m-1", title: "Phiên test giỏ", description: null, coverImageKey: null,
  status: "live", channelArn: null, playbackUrl: null, replayUrl: null, scheduledAt: null,
  startedAt: "2026-10-24T10:00:00Z", endedAt: null, createdAt: "2026-10-24T09:00:00Z", updatedAt: "2026-10-24T09:00:00Z",
  productCount: 1,
  products: [{ id: "lp-1", livestreamId: LIVE_ID, productId: "p-1", variantId: null, displayOrder: 1, isFeatured: false,
    createdAt: "2026-10-24T09:00:00Z", productName: "Áo mmm", skuCode: "AO-MMM", price: 250000 }],
};

const GIO_CO_AO = {
  id: "order-1", orderCode: "LIVE-20261024-aaa111", status: "DRAFT", totalAmount: "750000.00",
  recipientName: null, recipientPhone: null, shippingAddress: null, addressNormalized: false,
  livestreamTitle: "Phiên test giỏ", confirmToken: TOKEN,
  items: [{ id: "item-1", skuId: "1", skuCode: "AO-MMM", productName: "Áo mmm", variantName: "Đen · M",
    imageUrl: null, sourceComment: "tôi muốn mua 3 cái áo mmm", quantity: 3, requestedQty: 3, isPartial: false, unitPrice: "250000.00" }],
};

const DIA_CHI = [{
  id: "dc-1", recipientName: "Lê Trần Tiến", recipientPhone: "0989541246", provinceName: "Khánh Hòa",
  wardCode: "22366", wardName: "Phường Nha Trang", streetLine: "88 Trần Phú", label: "HOME", isDefault: true,
  createdAt: "2026-10-22T00:00:00Z",
}];

type Gio = typeof GIO_CO_AO | null;

/** Dựng trang live với máy chủ giả; `trangThai.gio` là giỏ hiện tại, đổi được giữa chừng. */
async function dungTrang(page: Page, daDangNhap: boolean, trangThai: { gio: Gio; aiXong: boolean }) {
  const yeuCau: Array<{ method: string; path: string; body: unknown }> = [];

  await page.route((u) => u.pathname.startsWith("/api/"), async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const p = u.pathname;
    const m = req.method();
    if (p.startsWith("/api/me/cart") || p.startsWith("/api/orders/confirm/")) {
      yeuCau.push({ method: m, path: p, body: m === "GET" ? null : req.postDataJSON() });
    }

    if (p === "/api/livestreams/public/live") return route.fulfill({ json: { items: [{ id: LIVE_ID, title: PHIEN.title }] } });
    if (p === `/api/livestreams/${LIVE_ID}`) return route.fulfill({ json: PHIEN });
    if (p === `/api/livestreams/${LIVE_ID}/chat-token`) return route.fulfill({ status: 503, json: { error: "no ivs" } });
    if (p === `/api/livestreams/${LIVE_ID}/comments` && m === "GET") return route.fulfill({ json: { data: [] } });
    if (p === `/api/livestreams/${LIVE_ID}/comments` && m === "POST") {
      const body = req.postDataJSON();
      return route.fulfill({ status: 201, json: {
        data: { id: "c-1", livestreamId: LIVE_ID, userId: body.userId, username: body.username, content: body.content, role: "buyer", createdAt: new Date().toISOString() },
        confirmationReceipt: "bien-nhan-gia",
      } });
    }
    if (p === "/api/orders/by-comment/c-1/confirmation") {
      if (trangThai.aiXong) {
        trangThai.gio = GIO_CO_AO;
        return route.fulfill({ json: { status: "ready", orderCode: GIO_CO_AO.orderCode, confirmPath: `/confirm/${TOKEN}` } });
      }
      return route.fulfill({ json: { status: "processing" } });
    }
    if (p === "/api/me/customer-ids") return route.fulfill({ status: 204, body: "" });
    if (p === "/api/me/cart" && m === "GET") return route.fulfill({ json: { cart: trangThai.gio } });
    if (p.startsWith("/api/me/cart/items/") && m === "PATCH") {
      const q = req.postDataJSON().quantity as number;
      trangThai.gio = trangThai.gio && { ...trangThai.gio, totalAmount: String(q * 250000) + ".00",
        items: trangThai.gio.items.map((i) => ({ ...i, quantity: q, requestedQty: q })) };
      return route.fulfill({ json: { cart: trangThai.gio } });
    }
    if (p.startsWith("/api/me/cart/items/") && m === "DELETE") {
      trangThai.gio = null;
      return route.fulfill({ json: { cart: null } });
    }
    if (p === "/api/me/addresses") return route.fulfill({ json: { items: DIA_CHI } });
    if (p === "/api/me/profile") return route.fulfill({ json: { id: 7, email: "tien@example.com", fullName: "Lê Trần Tiến", phone: "0989541246", role: "customer" } });
    if (p === `/api/orders/confirm/${TOKEN}` && m === "POST") {
      trangThai.gio = null;
      return route.fulfill({ json: { ...GIO_CO_AO, ...req.postDataJSON(), status: "CONFIRMED" } });
    }
    if (p.startsWith("/api/payments/customer/confirm/")) {
      if (p.endsWith("/gateways")) return route.fulfill({ json: { items: [{ name: "mock", label: "Cổng giả", ready: true, missing: [] }] } });
      if (p.endsWith("/status")) return route.fulfill({ json: { method: "ONLINE", status: "PENDING", amount: "750000.00", paidAmount: "0" } });
      return route.fulfill({ json: { available: false, reason: "UNCONFIGURED", status: null, amount: null, paidAmount: null, txnRef: null, bankCode: null, accountNumber: null, accountName: null, qrUrl: null, sandbox: true } });
    }
    if (p === "/api/shipments/provinces") return route.fulfill({ json: { items: ["Khánh Hòa"] } });
    if (p === "/api/shipments/wards-current") return route.fulfill({ json: { items: [{ code: "22366", name: "Phường Nha Trang" }] } });
    return route.fulfill({ status: 404, json: { error: "NotStubbed", path: p } });
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
  await page.goto("/");
  await expect(page.getByRole("heading", { name: PHIEN.title })).toBeVisible();
  return yeuCau;
}

const nutGio = (page: Page) => page.getByRole("button", { name: /^Giỏ hàng/ });
const ngan = (page: Page) => page.getByTestId("gio-hang");

async function binhLuanChot(page: Page) {
  await page.getByLabel("Bình luận của bạn").fill("tôi muốn mua 3 cái áo mmm");
  await page.getByRole("button", { name: "Gửi bình luận" }).click();
}

test("đăng nhập, giỏ trống: nút giỏ không có huy hiệu, mở ra thấy giỏ trống", async ({ page }) => {
  await dungTrang(page, true, { gio: null, aiXong: true });
  await expect(nutGio(page)).toBeVisible();
  await expect(page.getByTestId("so-mon-gio")).toHaveCount(0);

  await nutGio(page).click();
  await expect(ngan(page)).toBeVisible();
  await expect(ngan(page).getByText("Giỏ hàng trống.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ngan(page)).toHaveCount(0);
});

test("bình luận chốt → AI ok → toast nói đúng món, huy hiệu nhảy, giỏ có món", async ({ page }) => {
  await dungTrang(page, true, { gio: null, aiXong: true });
  await binhLuanChot(page);

  const toast = page.getByTestId("toast");
  await expect(toast).toContainText("Đã thêm 3 × Áo mmm vào giỏ hàng");
  await expect(page.getByTestId("so-mon-gio")).toHaveText("3");
  // Đã đăng nhập thì không còn đường dẫn rời trang.
  await expect(page.getByRole("link", { name: /Mở form xác nhận/ })).toHaveCount(0);

  await toast.getByRole("button", { name: "Xem giỏ" }).click();
  const mon = ngan(page).getByTestId("mon-trong-gio");
  await expect(mon).toHaveCount(1);
  await expect(mon).toContainText("Áo mmm");
  await expect(mon).toContainText("Đen · M");
  await expect(ngan(page)).toContainText("Tạm tính (3 sản phẩm)");
  await expect(ngan(page)).toContainText("750.000");
});

test("tăng / giảm / xoá gửi đúng yêu cầu và cập nhật giỏ", async ({ page }) => {
  const yeuCau = await dungTrang(page, true, { gio: GIO_CO_AO, aiXong: true });
  await nutGio(page).click();
  const mon = ngan(page).getByTestId("mon-trong-gio");

  await mon.getByRole("button", { name: "Tăng số lượng" }).click();
  await expect(mon.getByRole("group")).toContainText("4");
  await expect(page.getByTestId("so-mon-gio")).toHaveText("4");
  expect(yeuCau.find((r) => r.method === "PATCH")?.body).toEqual({ quantity: 4 });

  await mon.getByRole("button", { name: "Giảm số lượng" }).click();
  await expect(mon.getByRole("group")).toContainText("3");

  await mon.getByRole("button", { name: /^Bỏ / }).click();
  await expect(ngan(page).getByText("Giỏ hàng trống.")).toBeVisible();
  await expect(page.getByTestId("so-mon-gio")).toHaveCount(0);
  expect(yeuCau.some((r) => r.method === "DELETE" && r.path.endsWith("/item-1"))).toBe(true);
});

test("Xác nhận mua hàng → địa chỉ mặc định + COD → Đã chốt đơn, giỏ về trống", async ({ page }) => {
  const yeuCau = await dungTrang(page, true, { gio: GIO_CO_AO, aiXong: true });
  await nutGio(page).click();
  await ngan(page).getByRole("button", { name: "Xác nhận mua hàng" }).click();

  await expect(ngan(page).getByRole("heading", { name: "Xác nhận mua hàng" })).toBeVisible();
  const diaChi = ngan(page).getByTestId("dia-chi-nhan-hang");
  await expect(diaChi).toContainText("Lê Trần Tiến");
  await expect(diaChi).toContainText("88 Trần Phú, Phường Nha Trang, Khánh Hòa");
  await expect(ngan(page).getByRole("radio", { name: /COD/ })).toBeChecked();
  await expect(ngan(page)).toContainText("3 × Áo mmm");

  await ngan(page).getByLabel("Ghi chú cho shipper (không bắt buộc)").fill("Gọi trước khi giao");
  await ngan(page).getByRole("button", { name: "Xác nhận đơn hàng" }).click();

  await expect(ngan(page).getByRole("heading", { name: "Đã chốt đơn" })).toBeVisible();
  await expect(ngan(page).getByRole("link", { name: "Xem đơn mua" })).toHaveAttribute("href", "/orders");
  const xacNhan = yeuCau.find((r) => r.method === "POST" && r.path.includes("/orders/confirm/"));
  expect(xacNhan?.body).toMatchObject({
    recipientName: "Lê Trần Tiến", recipientPhone: "0989541246", provinceName: "Khánh Hòa",
    wardCode: "22366", streetLine: "88 Trần Phú", note: "Gọi trước khi giao", paymentMethod: "COD",
  });
  await expect(page.getByTestId("so-mon-gio")).toHaveCount(0);
});

test("chọn chuyển khoản thì khối thanh toán hiện ngay trong ngăn kéo", async ({ page }) => {
  await dungTrang(page, true, { gio: GIO_CO_AO, aiXong: true });
  await nutGio(page).click();
  await ngan(page).getByRole("button", { name: "Xác nhận mua hàng" }).click();
  await ngan(page).getByRole("radio", { name: /Chuyển khoản/ }).check();
  await ngan(page).getByRole("button", { name: "Xác nhận đơn hàng" }).click();

  await expect(ngan(page).getByText(/Chọn cổng hoặc quét QR/)).toBeVisible();
  await expect(ngan(page).getByText("Thanh toán trực tuyến")).toBeVisible();
});

test("chưa đăng nhập: nút giỏ dẫn tới đăng nhập, vẫn có link mở form như cũ", async ({ page }) => {
  await dungTrang(page, false, { gio: null, aiXong: true });
  await expect(page.getByRole("link", { name: /^Giỏ hàng/ })).toHaveAttribute("href", "/login");

  await binhLuanChot(page);
  await expect(page.getByRole("link", { name: /Mở form xác nhận/ })).toHaveAttribute("href", `/confirm/${TOKEN}`);
  await expect(page.getByTestId("toast")).toHaveCount(0);
});
