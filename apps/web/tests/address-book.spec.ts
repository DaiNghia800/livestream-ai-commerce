import { expect, test, type Page } from "@playwright/test";

/**
 * Tài khoản khách: menu avatar, hồ sơ, sổ địa chỉ — và cách chúng
 * đi vào trang xác nhận đơn (luồng kiểu các sàn lớn).
 *
 * Giữ chặt hai điều: đã đăng nhập thì KHÔNG còn ô nào để gõ lại địa
 * chỉ, chỉ chọn trong sổ; chưa đăng nhập thì form tay nguyên như cũ —
 * khách live không bắt buộc có tài khoản.
 */

const TOKEN = "test-token-so-dia-chi";

const DON = {
  id: "order-sdc",
  orderCode: "LIVE-SDC-001",
  status: "PENDING_CONFIRMATION",
  totalAmount: "250000.00",
  recipientName: null,
  recipientPhone: null,
  shippingAddress: null,
  addressNormalized: false,
  livestreamTitle: null,
  items: [
    {
      id: "item-1", skuId: "1", skuCode: "AO-L", productName: "Áo sơ mi lụa",
      variantName: null, imageUrl: null, sourceComment: null,
      quantity: 1, requestedQty: 1, isPartial: false, unitPrice: "250000.00",
    },
  ],
};

const HO_SO = {
  id: 7, email: "tien@example.com", fullName: "Lê Trần Tiến", phone: "0989541246", role: "customer",
};

const DIA_CHI = [
  {
    id: "dc-1", recipientName: "Lê Trần Tiến", recipientPhone: "0989541246",
    provinceName: "Khánh Hòa", wardCode: "22366", wardName: "Phường Nha Trang",
    streetLine: "88 Trần Phú", label: "HOME", isDefault: true, createdAt: "2026-10-22T00:00:00Z",
  },
  {
    id: "dc-2", recipientName: "Lê Trần Tiến", recipientPhone: "0989541246",
    provinceName: "Hà Nội", wardCode: "00001", wardName: "Phường Ba Đình",
    streetLine: "1 Hùng Vương", label: "OFFICE", isDefault: false, createdAt: "2026-10-21T00:00:00Z",
  },
];

async function dungTrang(
  page: Page,
  daDangNhap: boolean,
  opts: { diaChi?: typeof DIA_CHI } = {},
) {
  const diaChi = opts.diaChi ?? DIA_CHI;
  await page.route("**/api/shipments/provinces", (r) =>
    r.fulfill({ json: { items: ["Hà Nội", "Khánh Hòa"] } }),
  );
  await page.route("**/api/shipments/wards-current?province=*", (r) => {
    const tinh = new URL(r.request().url()).searchParams.get("province");
    r.fulfill({
      json: {
        items: tinh === "Khánh Hòa"
          ? [{ code: "22366", name: "Phường Nha Trang" }]
          : [{ code: "00001", name: "Phường Ba Đình" }],
      },
    });
  });
  await page.route("**/api/me/profile", (r) => r.fulfill({ json: HO_SO }));
  await page.route("**/api/me/addresses", async (r) => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      await r.fulfill({
        status: 201,
        json: { ...body, id: "dc-moi", wardName: "Phường Nha Trang", isDefault: true, createdAt: "2026-10-22T00:00:00Z" },
      });
      return;
    }
    await r.fulfill({ json: { items: diaChi } });
  });
  await page.route("**/api/payments/customer/confirm/*/status", (r) =>
    r.fulfill({ json: { method: null, status: null, amount: null, paidAmount: null } }),
  );
  await page.route("**/api/payments/customer/confirm/*/gateways", (r) =>
    r.fulfill({ json: { items: [{ name: "mock", label: "Cổng giả", ready: true, missing: [] }] } }),
  );
  await page.route("**/api/payments/customer/confirm/*", (r) =>
    r.fulfill({ json: { available: false, reason: "UNCONFIGURED", status: null, amount: null,
      paidAmount: null, txnRef: null, bankCode: null, accountNumber: null,
      accountName: null, qrUrl: null, sandbox: true } }),
  );
  await page.route(`**/api/orders/confirm/${TOKEN}`, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        json: { ...DON, ...route.request().postDataJSON(), status: "CONFIRMED" },
      });
      return;
    }
    await route.fulfill({ json: DON });
  });

  // Token nằm trong localStorage; phải đặt TRƯỚC khi trang nạp,
  // nếu không lần render đầu đã quyết định là "chưa đăng nhập".
  await page.addInitScript((coToken: boolean) => {
    if (coToken) {
      localStorage.setItem("access_token", "token-gia");
      localStorage.setItem(
        "auth_user",
        JSON.stringify({ full_name: "Lê Trần Tiến", email: "tien@example.com" }),
      );
    } else {
      localStorage.removeItem("access_token");
      localStorage.removeItem("auth_user");
    }
  }, daDangNhap);
  await page.goto(`/confirm/${TOKEN}`);
}

const nutTaiKhoan = (page: Page) => page.getByRole("button", { name: "Tài khoản của tôi" });

test.describe("Trang xác nhận — địa chỉ từ sổ", () => {
  test("đã đăng nhập: một dòng địa chỉ mặc định, KHÔNG có ô gõ tay", async ({ page }) => {
    await dungTrang(page, true);

    const dong = page.getByTestId("dia-chi-nhan-hang");
    await expect(dong).toContainText("Lê Trần Tiến");
    await expect(dong).toContainText("(0989541246)");
    await expect(dong).toContainText("88 Trần Phú, Phường Nha Trang, Khánh Hòa");
    await expect(dong).toContainText("Mặc định");
    await expect(dong).toContainText("Nhà riêng");

    await expect(page.getByLabel("Họ và tên người nhận")).toHaveCount(0);
    await expect(page.getByLabel("Số nhà, tên đường")).toHaveCount(0);
    // Mặc định đã chọn sẵn → nút xác nhận mở khoá ngay.
    await expect(page.getByRole("button", { name: "Xác nhận đơn hàng" })).toBeEnabled();
  });

  test("Thay đổi → popup chọn, chọn địa chỉ khác rồi Xác nhận", async ({ page }) => {
    await dungTrang(page, true);
    await page.getByRole("button", { name: "Thay đổi" }).click();

    const popup = page.getByRole("dialog", { name: "Địa chỉ của tôi" });
    await expect(popup).toBeVisible();
    await expect(popup.getByRole("radio")).toHaveCount(2);
    await expect(popup.getByText("1 Hùng Vương")).toBeVisible();

    await popup.getByRole("radio", { name: /1 Hùng Vương/ }).check();
    await popup.getByRole("button", { name: "Xác nhận" }).click();

    const dong = page.getByTestId("dia-chi-nhan-hang");
    await expect(dong).toContainText("1 Hùng Vương, Phường Ba Đình, Hà Nội");
    await expect(dong).toContainText("Văn phòng");
    await expect(dong).not.toContainText("Mặc định");
  });

  test("địa chỉ đã chọn đi vào thân xác nhận đúng từng trường", async ({ page }) => {
    await dungTrang(page, true);
    await page.getByRole("button", { name: "Thay đổi" }).click();
    const popup = page.getByRole("dialog", { name: "Địa chỉ của tôi" });
    await popup.getByRole("radio", { name: /1 Hùng Vương/ }).check();
    await popup.getByRole("button", { name: "Xác nhận" }).click();

    const [yeuCau] = await Promise.all([
      page.waitForRequest(
        (r) => r.url().includes("/orders/confirm/") && r.method() === "POST",
      ),
      page.getByRole("button", { name: "Xác nhận đơn hàng" }).click(),
    ]);

    expect(yeuCau.postDataJSON()).toMatchObject({
      recipientName: "Lê Trần Tiến",
      recipientPhone: "0989541246",
      provinceName: "Hà Nội",
      wardCode: "00001",
      streetLine: "1 Hùng Vương",
    });
  });

  test("sổ trống: mời thêm địa chỉ, form điền sẵn tên + SĐT từ hồ sơ", async ({ page }) => {
    await dungTrang(page, true, { diaChi: [] });

    await expect(page.getByText("Bạn chưa có địa chỉ nhận hàng.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Xác nhận đơn hàng" })).toBeDisabled();

    await page.getByRole("button", { name: "Thêm địa chỉ" }).click();
    const form = page.getByRole("dialog", { name: "Địa chỉ mới" });
    await expect(form.getByLabel("Họ và tên")).toHaveValue("Lê Trần Tiến");
    await expect(form.getByLabel("Số điện thoại")).toHaveValue("0989541246");
    // Địa chỉ đầu tiên luôn là mặc định — ô bị khoá ở trạng thái bật.
    await expect(form.getByRole("checkbox")).toBeChecked();
    await expect(form.getByRole("checkbox")).toBeDisabled();
  });

  test("chưa đăng nhập: form tay vẫn nguyên, không có dòng địa chỉ", async ({ page }) => {
    await dungTrang(page, false);

    await expect(page.getByLabel("Họ và tên người nhận")).toBeVisible();
    await expect(page.getByTestId("dia-chi-nhan-hang")).toHaveCount(0);
    await expect(page.getByLabel("Số nhà, tên đường")).toHaveAttribute("autocomplete", "off");
  });
});

test.describe("Menu tài khoản", () => {
  test("avatar mở menu ba mục; Địa chỉ nhận hàng mở sổ", async ({ page }) => {
    await dungTrang(page, true);
    await nutTaiKhoan(page).click();

    const menu = page.getByRole("menu", { name: "Tài khoản của tôi" });
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Thông tin cá nhân",
      "Đơn mua",
      "Địa chỉ nhận hàng",
      "Đăng xuất",
    ]);

    await menu.getByRole("menuitem", { name: "Địa chỉ nhận hàng" }).click();
    const so = page.getByRole("dialog", { name: "Địa chỉ của tôi" });
    await expect(so).toBeVisible();
    await expect(so.getByText("88 Trần Phú")).toBeVisible();
    await expect(so.getByText("1 Hùng Vương")).toBeVisible();
    await expect(so.getByText("Mặc định", { exact: true })).toHaveCount(1);
    // Chỉ địa chỉ không mặc định mới có nút này, và không được xoá cái mặc định.
    await expect(so.getByRole("button", { name: "Thiết lập mặc định" })).toHaveCount(1);
    await expect(so.getByRole("button", { name: "Xoá" })).toHaveCount(1);
  });

  test("Thêm địa chỉ: tỉnh và phường là popup chọn, có loại địa chỉ", async ({ page }) => {
    await dungTrang(page, true);
    await nutTaiKhoan(page).click();
    await page.getByRole("menuitem", { name: "Địa chỉ nhận hàng" }).click();
    await page.getByRole("button", { name: "Thêm địa chỉ" }).click();

    const form = page.getByRole("dialog", { name: "Địa chỉ mới" });
    await expect(form.getByLabel("Chọn phường/xã")).toBeDisabled();
    await form.getByLabel("Chọn tỉnh/thành").click();
    await page.getByRole("dialog", { name: "Chọn tỉnh/thành" }).getByRole("button", { name: "Khánh Hòa" }).click();
    await expect(form.getByLabel("Chọn phường/xã")).toBeEnabled();
    await form.getByLabel("Chọn phường/xã").click();
    await page.getByRole("button", { name: "Phường Nha Trang" }).click();
    await expect(form.getByLabel("Chọn phường/xã")).toHaveText("Phường Nha Trang");

    await form.getByRole("button", { name: "Văn phòng" }).click();
    await expect(form.getByRole("button", { name: "Văn phòng" })).toHaveAttribute("aria-pressed", "true");
    await form.getByLabel("Địa chỉ cụ thể").fill("90 Trần Phú");

    const [yeuCau] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/me/addresses") && r.method() === "POST"),
      form.getByRole("button", { name: "Hoàn thành" }).click(),
    ]);
    expect(yeuCau.postDataJSON()).toMatchObject({
      provinceName: "Khánh Hòa", wardCode: "22366", streetLine: "90 Trần Phú", label: "OFFICE",
    });
  });

  test("Thông tin cá nhân: email chỉ đọc, tên + SĐT sửa được", async ({ page }) => {
    await dungTrang(page, true);
    await nutTaiKhoan(page).click();
    await page.getByRole("menuitem", { name: "Thông tin cá nhân" }).click();

    const hs = page.getByRole("dialog", { name: "Thông tin cá nhân" });
    await expect(hs.getByLabel("Email")).toHaveValue("tien@example.com");
    await expect(hs.getByLabel("Email")).toHaveAttribute("readonly", "");
    await expect(hs.getByLabel("Họ và tên")).toHaveValue("Lê Trần Tiến");
    await expect(hs.getByLabel("Số điện thoại")).toHaveValue("0989541246");
  });

  test("chưa đăng nhập thì chỉ có link Đăng nhập", async ({ page }) => {
    await dungTrang(page, false);
    await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
    await expect(nutTaiKhoan(page)).toHaveCount(0);
  });
});
