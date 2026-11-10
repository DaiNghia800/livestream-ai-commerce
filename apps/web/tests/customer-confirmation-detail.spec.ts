import { expect, test, type Page } from "@playwright/test";

/**
 * Các khối bổ sung trên trang khách xác nhận đơn (theo mẫu 120d).
 *
 * Trọng tâm không phải "có hiện ra không" mà là **không bịa số**.
 * Mẫu thiết kế vẽ giá gốc gạch ngang, quà tặng kèm và voucher
 * freeship; hệ thống không có bảng nào cho ba thứ đó. Vẽ chúng bằng
 * số cứng là in thông tin sai lên màn hình khách đang chuẩn bị trả
 * tiền — nên ở đây có hẳn một ca canh chúng KHÔNG xuất hiện.
 */

const TOKEN = "test-token-chi-tiet";

const DON = {
  id: "order-ct",
  orderCode: "LIVE-CT-001",
  status: "PENDING_CONFIRMATION",
  totalAmount: "250000.00",
  recipientName: null,
  recipientPhone: null,
  shippingAddress: null,
  addressNormalized: false,
  livestreamTitle: "Xả Kho Đón Hè – BST Linen",
  items: [
    {
      id: "item-1",
      skuId: "1",
      skuCode: "AO-L",
      productName: "Áo sơ mi lụa",
      variantName: "Be · L",
      imageUrl: "https://example.test/ao.png",
      sourceComment: "ao linen size L mau be cho m 2 cai",
      quantity: 2,
      requestedQty: 2,
      isPartial: false,
      unitPrice: "125000.00",
    },
  ],
};

async function dungTrang(
  page: Page,
  ghiDe: Record<string, unknown> = {},
  thanhToan: { method: "COD" | "ONLINE" | null; status: string | null } = {
    method: null,
    status: null,
  },
  // Máy chủ trả gì cho POST xác nhận; mặc định là "đã xác nhận".
  postTraLoi?: { status: number; json: unknown },
) {
  const don = { ...DON, ...ghiDe };
  // Tình trạng thu tiền: trang hỏi lại mỗi vài giây để tự đổi.
  await page.route("**/api/payments/customer/confirm/*/status", (r) =>
    r.fulfill({ json: { ...thanhToan, amount: don.totalAmount, paidAmount: "0" } }),
  );
  await page.route("**/api/payments/customer/confirm/*/gateways", (r) =>
    r.fulfill({ json: { items: [{ name: "mock", label: "Cổng giả", ready: true, missing: [] }] } }),
  );
  await page.route("**/api/payments/customer/confirm/*", (r) =>
    r.fulfill({ json: { available: false, reason: "UNCONFIGURED", status: null, amount: null,
      paidAmount: null, txnRef: null, bankCode: null, accountNumber: null,
      accountName: null, qrUrl: null, sandbox: true } }),
  );
  await page.route("**/api/shipments/provinces", (r) =>
    r.fulfill({ json: { items: ["Hà Nội", "TP. Hồ Chí Minh"] } }),
  );
  await page.route("**/api/shipments/wards-current?province=*", (r) =>
    r.fulfill({ json: { items: [{ code: "26743", name: "Phường Bến Thành" }] } }),
  );
  await page.route(`**/api/orders/confirm/${TOKEN}`, async (route) => {
    if (route.request().method() === "POST") {
      if (postTraLoi) {
        await route.fulfill({ status: postTraLoi.status, json: postTraLoi.json });
        return;
      }
      await route.fulfill({
        json: { ...don, ...route.request().postDataJSON(), status: "CONFIRMED" },
      });
      return;
    }
    await route.fulfill({ json: don });
  });
  await page.goto(`/confirm/${TOKEN}`);
}

/** Điền đủ phần bắt buộc để nút xác nhận mở khoá. */
async function dienDiaChi(page: Page) {
  await page.getByLabel("Họ và tên người nhận").fill("Nguyễn An");
  await page.getByLabel("Số điện thoại").fill("0901234567");
  await page.getByLabel("Chọn tỉnh/thành").click();
  await page.getByRole("button", { name: "TP. Hồ Chí Minh" }).click();
  await page.getByLabel("Chọn phường/xã").click();
  await page.getByRole("button", { name: "Phường Bến Thành" }).click();
  await page.getByLabel("Số nhà, tên đường").fill("12 Nguyễn Huệ");
}

test.describe("Trang xác nhận — bối cảnh phiên live", () => {
  test("hiện tên phiên và CHÍNH câu khách đã gõ", async ({ page }) => {
    // Khách nhận ra đơn của mình nhờ câu họ bình luận, không nhờ mã
    // đơn — mã đơn là thứ họ chưa từng thấy bao giờ.
    await dungTrang(page);

    await expect(page.getByText("Xả Kho Đón Hè – BST Linen")).toBeVisible();
    await expect(
      page.getByText("ao linen size L mau be cho m 2 cai"),
    ).toBeVisible();
  });

  test("đơn không đến từ phiên live thì GIẤU khối đó", async ({ page }) => {
    await dungTrang(page, {
      livestreamTitle: null,
      items: [{ ...DON.items[0], sourceComment: null }],
    });

    await expect(page.getByText("Sản phẩm đã chốt")).toBeVisible();
    await expect(page.getByText(/AI chốt đơn tự động/)).toBeHidden();
  });

  test("dòng hàng nêu phân loại đã chốt", async ({ page }) => {
    // "Áo sơ mi lụa" là chưa đủ: khách chốt màu be size L, giao màu
    // khác là khiếu nại.
    await dungTrang(page);
    await expect(page.getByText(/Be · L/)).toBeVisible();
  });
});

test.describe("Trang xác nhận — giữ chỗ và hết hàng", () => {
  test("không còn đồng hồ; nói rõ hàng chỉ trừ kho lúc bấm xác nhận", async ({ page }) => {
    await dungTrang(page);

    // Đơn nháp không giữ tồn và không hết hạn — không có gì để đếm.
    await expect(page.getByRole("timer")).toHaveCount(0);
    await expect(page.getByText(/Link này không hết hạn/)).toBeVisible();
    await expect(page.getByText(/chỉ được trừ/)).toContainText("2");
  });

  test("hết hàng đúng lúc bấm: nói thẳng mã nào thiếu, đơn vẫn mở để sửa", async ({ page }) => {
    // Người khác vừa xác nhận trước; máy chủ trả 409 kèm mã thiếu.
    await dungTrang(page, {}, { method: null, status: null }, {
      status: 409,
      json: {
        error: "OutOfStock",
        message: "SKU 1: cần 2, chỉ còn 1 khả dụng",
        rejected: [{ skuId: "1", requested: 2, sellable: 1 }],
      },
    });
    await dienDiaChi(page);

    await page.getByRole("button", { name: "Xác nhận đơn hàng" }).click();

    // Tên sản phẩm chứ không phải mã SKU — khách không biết "1" là gì.
    // Lọc theo chữ: Next còn một role=alert rỗng cho bộ đọc màn hình.
    await expect(page.getByRole("alert").filter({ hasText: /Rất tiếc/ })).toContainText(
      "Áo sơ mi lụa chỉ còn 1 (bạn chọn 2)",
    );
    await expect(page.getByRole("button", { name: "Xác nhận đơn hàng" })).toBeVisible();
  });
});

test.describe("Trang xác nhận — phương thức thanh toán", () => {
  test("mặc định COD, và gửi đúng lựa chọn lên máy chủ", async ({ page }) => {
    await dungTrang(page);
    await dienDiaChi(page);

    await expect(page.getByRole("radio", { name: /COD/ })).toBeChecked();

    const [yeuCau] = await Promise.all([
      page.waitForRequest(
        (r) => r.url().includes("/orders/confirm/") && r.method() === "POST",
      ),
      page.getByRole("button", { name: "Xác nhận đơn hàng" }).click(),
    ]);
    expect(yeuCau.postDataJSON()).toMatchObject({ paymentMethod: "COD" });
  });

  test("đổi sang chuyển khoản thì gửi ONLINE", async ({ page }) => {
    await dungTrang(page);
    await dienDiaChi(page);
    await page.getByRole("radio", { name: /Chuyển khoản/ }).check();

    const [yeuCau] = await Promise.all([
      page.waitForRequest(
        (r) => r.url().includes("/orders/confirm/") && r.method() === "POST",
      ),
      page.getByRole("button", { name: "Xác nhận đơn hàng" }).click(),
    ]);
    expect(yeuCau.postDataJSON()).toMatchObject({ paymentMethod: "ONLINE" });
  });
});

test.describe("Trang xác nhận — không bịa số", () => {
  test("KHÔNG hiện giá gốc, quà tặng hay voucher vì chưa có dữ liệu", async ({
    page,
  }) => {
    // Mẫu thiết kế có cả ba. Vẽ chúng bằng số cứng là in thông tin
    // sai lên màn hình khách đang chuẩn bị trả tiền.
    await dungTrang(page);
    await expect(page.getByText("Sản phẩm đã chốt")).toBeVisible();

    for (const chu of [/Tiết kiệm/, /Quà tặng/, /[Vv]oucher/, /Freeship/]) {
      await expect(page.getByText(chu)).toHaveCount(0);
    }
  });

  test("phí vận chuyển nói thẳng là chưa tính được", async ({ page }) => {
    // Hãng báo giá theo địa chỉ, mà lúc này khách còn đang gõ. Hiện
    // một con số rồi đổi sau là mất lòng tin đúng chỗ nhạy nhất.
    await dungTrang(page);
    await expect(
      page.getByText("shop báo sau khi chốt địa chỉ"),
    ).toBeVisible();
  });
});

test.describe("Trang xác nhận — chốt COD là xong", () => {
  test("đã chốt COD thì báo rõ, và GIẤU cả hai khối thanh toán", async ({
    page,
  }) => {
    // COD không có cổng nào để đi tiếp. Hiện khối chuyển khoản hay
    // chọn cổng lúc này là mời khách trả tiền cho một đơn đã chọn
    // trả khi nhận.
    await dungTrang(page, { status: "CONFIRMED", heldUntil: null },
      { method: "COD", status: "PENDING" });

    await expect(page.getByText(/Đã chốt đơn/)).toBeVisible();
    await expect(page.getByText(/tiền mặt khi nhận hàng/)).toBeVisible();
    await expect(page.getByText("Thanh toán trực tuyến")).toHaveCount(0);
    await expect(page.getByText("Thanh toán chuyển khoản")).toHaveCount(0);
  });

  test("chốt ONLINE thì vẫn hiện khối chọn cổng", async ({ page }) => {
    // Chốt chặn trên không được ăn lan sang nhánh trả trước.
    await dungTrang(page, { status: "CONFIRMED", heldUntil: null },
      { method: "ONLINE", status: "PENDING" });

    await expect(page.getByText("Thanh toán trực tuyến")).toBeVisible();
    await expect(page.getByText(/Đã chốt đơn\./)).toHaveCount(0);
  });
});
