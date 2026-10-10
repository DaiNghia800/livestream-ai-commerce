import type { Page, Route } from "@playwright/test";

/**
 * Chặn mọi lời gọi tới commerce service và trả dữ liệu dựng sẵn.
 *
 * Bộ e2e này kiểm GIAO DIỆN: bộ lọc, hộp thoại, trạng thái rỗng, bẫy
 * tràn khung. Bắt nó chạy kèm Postgres và một service thật sẽ làm nó
 * chậm, hay đỏ vì lý do không liên quan, và không dựng nổi các tình
 * huống như "dịch vụ sập" hay "khách chuyển thiếu tiền".
 *
 * Đúng đắn của backend đã có 543 test riêng lo.
 */

const BASE = "http://localhost:8000/api";

export const ORDER_DRAFT = {
  id: "11111111-1111-4111-8111-111111111111",
  orderCode: "LIVE-20261010-aaa111",
  status: "DRAFT",
  source: "COMMENT_AI",
  totalAmount: "398000.00",
  // Luôn còn 5 phút so với lúc test chạy, để ô đếm ngược có gì mà đếm.
  heldUntil: new Date(Date.now() + 300_000).toISOString(),
  recipientName: null,
  recipientPhone: null,
  livestreamId: null,
  codBlocked: false,
  createdAt: "2026-10-10T19:40:00+07:00",
  itemCount: "1",
  paymentStatus: null,
  paymentMethod: null,
};

export const ORDER_CANCELLED = {
  ...ORDER_DRAFT,
  id: "22222222-2222-4222-8222-222222222222",
  orderCode: "LIVE-20261010-bbb222",
  status: "CANCELLED",
  heldUntil: null,
  recipientName: "Nguyễn Thuỳ Trang",
  recipientPhone: "0984122899",
  itemCount: "2",
};

export const ORDER_EXPIRED = {
  ...ORDER_DRAFT,
  id: "33333333-3333-4333-8333-333333333333",
  orderCode: "LIVE-20261010-ccc333",
  status: "EXPIRED",
  // Job quét xoá mốc giữ hàng khi cho hết hạn — đúng như backend làm.
  heldUntil: null,
  itemCount: "1",
};

/** Còn 30 giây: dùng để kiểm cảnh báo đổi màu dưới một phút. */
export const ORDER_SAP_HET = {
  ...ORDER_DRAFT,
  id: "44444444-4444-4444-8444-444444444444",
  orderCode: "LIVE-20261010-ddd444",
  heldUntil: new Date(Date.now() + 30_000).toISOString(),
};

export const ORDER_DETAIL = {
  id: ORDER_DRAFT.id,
  orderCode: ORDER_DRAFT.orderCode,
  status: "CONFIRMED",
  source: "COMMENT_AI",
  customerId: "aaaaaaaa-1111-4111-8111-111111111111",
  merchantId: "bbbbbbbb-2222-4222-8222-222222222222",
  totalAmount: "398000.00",
  heldUntil: null,
  recipientName: "Nguyễn Thuỳ Trang",
  recipientPhone: "0984122899",
  shippingAddress: "18 Duy Tân, phường Dịch Vọng Hậu, Cầu Giấy, Hà Nội",
  note: "Gọi trước khi giao",
  codBlocked: false,
  livestreamId: null,
  createdAt: "2026-10-10T19:40:00+07:00",
  items: [
    {
      id: "item-1",
      skuId: "sku-1",
      skuCode: "AO01-BE-L",
      productName: "Áo sơ mi lụa",
      variantName: "Be · L",
      quantity: 2,
      requestedQty: 2,
      isPartial: false,
      unitPrice: "199000.00",
    },
  ],
  history: [
    {
      fromStatus: "DRAFT",
      toStatus: "CONFIRMED",
      note: "Khách xác nhận qua link",
      changedAt: "2026-10-10T19:45:00+07:00",
    },
  ],
  payment: null,
};

export const PAYMENT_PAID = {
  id: "aaaa1111-1111-4111-8111-111111111111",
  orderId: ORDER_DRAFT.id,
  orderCode: ORDER_DRAFT.orderCode,
  txnRef: "LIVE20261010AAA111",
  method: "ONLINE",
  status: "PAID",
  amount: "398000.00",
  paidAmount: "398000.00",
  provider: "vnpay",
  failureReason: null,
  paidAt: "2026-10-10T19:50:00+07:00",
  refundedAt: null,
  refundAmount: null,
  createdAt: "2026-10-10T19:46:00+07:00",
  reconcile: "SETTLED",
  transactions: [
    {
      id: "txn-1",
      provider: "vnpay",
      providerTxnId: "14512345",
      amount: "398000.00",
      receivedAt: "2026-10-10T19:50:00+07:00",
    },
  ],
};

export const PAYMENT_UNDERPAID = {
  ...PAYMENT_PAID,
  id: "bbbb2222-2222-4222-8222-222222222222",
  orderCode: ORDER_CANCELLED.orderCode,
  txnRef: "LIVE20261010BBB222",
  status: "PENDING",
  paidAmount: "100000.00",
  paidAt: null,
  reconcile: "UNDERPAID",
  transactions: [
    {
      id: "txn-2",
      provider: "vcb",
      providerTxnId: "FT99",
      amount: "100000.00",
      receivedAt: "2026-10-10T19:48:00+07:00",
    },
  ],
};

export const REVIEW_REQUEST = {
  id: "cccc3333-3333-4333-8333-333333333333",
  customerId: "dddd4444-4444-4444-8444-444444444444",
  livestreamId: "eeee5555-5555-4555-8555-555555555555",
  commentId: "fb_123_456",
  source: "COMMENT_AI",
  status: "PENDING",
  confidence: "0.700",
  aiResult: { text: "cho e 2 cái áo xanh size M" },
  heldUntil: new Date(Date.now() + 240_000).toISOString(),
  guardReasons: ["QTY_ABOVE_THRESHOLD"],
  createdAt: "2026-10-10T19:41:00+07:00",
  lines: [{ skuId: "sku-aaaaaaaa", quantity: 2, requestedQty: 5, status: "HOLDING" }],
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export interface StubOptions {
  orders?: unknown[];
  orderDetail?: unknown | null;
  payments?: unknown[];
  reviewQueue?: unknown[];
  /** Bắt mọi lời gọi hỏng, để kiểm màn hình báo lỗi. */
  fail?: boolean;
}

/** Cài sẵn các tuyến API trước khi điều hướng. */
export async function stubApi(page: Page, options: StubOptions = {}) {
  const {
    // Nhân bản để có đủ đơn thử phân trang. Mã đơn phải khác nhau,
    // nếu không locator theo mã lại khớp nhiều dòng.
    orders = [
      ORDER_DRAFT,
      ORDER_CANCELLED,
      ORDER_EXPIRED,
      ORDER_SAP_HET,
      ...Array.from({ length: 21 }, (_, i) => ({
        ...ORDER_DRAFT,
        id: `bulk-${i}`,
        orderCode: `LIVE-20261010-b${String(i).padStart(5, "0")}`,
        totalAmount: String(100000 + i * 1000) + ".00",
      })),
    ],
    orderDetail = ORDER_DETAIL,
    payments = [PAYMENT_PAID, PAYMENT_UNDERPAID],
    reviewQueue = [REVIEW_REQUEST],
    fail = false,
  } = options;

  await page.route(`${BASE}/**`, async (route) => {
    if (fail) {
      return json(route, { message: "Dịch vụ tạm thời gián đoạn" }, 503);
    }

    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api", "");

    if (path.startsWith("/orders/by-code/")) {
      return orderDetail
        ? json(route, orderDetail)
        : json(route, { message: "Không tìm thấy đơn" }, 404);
    }

    if (path === "/orders") {
      // Lọc phía server trong đời thật, nên fixture cũng lọc để bộ
      // lọc trên giao diện có thứ để chứng minh.
      const status = url.searchParams.get("status");
      const rows = status
        ? orders.filter((o) => (o as { status: string }).status === status)
        : orders;
      return json(route, { items: rows });
    }

    if (path === "/payments") {
      const status = url.searchParams.get("status");
      const rows = status
        ? payments.filter((p) => (p as { status: string }).status === status)
        : payments;
      return json(route, { items: rows });
    }

    if (path === "/purchase-requests") {
      return json(route, { items: reviewQueue });
    }

    if (path.endsWith("/approve") || path.endsWith("/reject")) {
      return json(route, { ok: true });
    }

    if (path === "/orders/draft") {
      const than = route.request().postDataJSON() as {
        lines: Array<{ skuId: string; quantity: number }>;
      };
      return json(route, {
        ...(orderDetail as object),
        id: "reordered",
        orderCode: "LIVE-20261010-moi999",
        status: "DRAFT",
        // Trả lại đúng số lượng đã xin, để test đối chiếu được.
        rejected: [],
        requested: than.lines,
      });
    }

    if (path.endsWith("/cancel")) {
      return json(route, { ...(orderDetail as object), status: "CANCELLED" });
    }

    return json(route, {});
  });
}
