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
  activeShipmentId: null,
  addressNormalized: true,
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
  shipments?: unknown[];
  shipmentDetail?: unknown | null;
  tracking?: unknown | null;
  /** Bắt mọi lời gọi hỏng, để kiểm màn hình báo lỗi. */
  fail?: boolean;
}

// ── Vận chuyển ─────────────────────────────────────────────────────

const VAN_DON_CHUNG = {
  orderId: "order-1",
  serviceCode: "2",
  clientOrderCode: "LIVE-20261010-abc-1a2b3c",
  deliveryAttempt: 0,
  feeQuoted: "20900.00",
  feeActual: null,
  weightGram: 600,
  failureReason: null,
  trackingToken: "tok-abcdef0123456789abcdef",
  recipientName: "Nguyễn Thuỳ Trang",
};

export const SHIP_CHO_LAY = {
  ...VAN_DON_CHUNG,
  id: "ship-1",
  orderCode: "LIVE-20261010-abc123",
  carrier: "ghn",
  trackingCode: "GHN7728491",
  status: "CREATED",
  codAmount: "598000.00",
  lastSyncedAt: "2026-10-18T05:09:51.000Z",
  createdAt: "2026-10-18T05:09:48.000Z",
};

export const SHIP_DANG_DI = {
  ...VAN_DON_CHUNG,
  id: "ship-2",
  orderCode: "LIVE-20261010-def456",
  carrier: "ghtk",
  trackingCode: "GHTK9023194",
  status: "IN_TRANSIT",
  codAmount: "0.00",
  // Hãng cân lại ở kho rồi chốt cước cao hơn báo giá.
  feeActual: "26500.00",
  lastSyncedAt: "2026-10-18T06:00:00.000Z",
  createdAt: "2026-10-17T05:09:48.000Z",
};

export const SHIP_HONG = {
  ...VAN_DON_CHUNG,
  id: "ship-3",
  orderCode: "LIVE-20261010-ghi789",
  carrier: "ghn",
  trackingCode: "GHN8892100",
  status: "FAILED",
  codAmount: "380000.00",
  deliveryAttempt: 1,
  failureReason: "Giao lần 1 không gặp khách",
  lastSyncedAt: "2026-10-18T04:00:00.000Z",
  createdAt: "2026-10-16T05:09:48.000Z",
};

export const SHIP_TU_GIAO = {
  ...VAN_DON_CHUNG,
  id: "ship-4",
  orderCode: "LIVE-20261010-jkl012",
  carrier: "self",
  trackingCode: "SELF1A2B3C4D",
  status: "CREATED",
  codAmount: "150000.00",
  lastSyncedAt: null,
  createdAt: "2026-10-18T07:00:00.000Z",
};

export const SHIP_DETAIL = {
  ...SHIP_CHO_LAY,
  events: [
    {
      eventCode: "ready_to_pick",
      mappedStatus: "CREATED",
      occurredAt: "2026-10-18T05:09:50.000Z",
      description: "Tạo đơn hàng",
    },
    {
      eventCode: "created",
      mappedStatus: "CREATED",
      occurredAt: "2026-10-18T05:09:48.000Z",
      description: "Đã tạo vận đơn qua ghn",
    },
    {
      eventCode: "mot_ma_la",
      mappedStatus: null,
      occurredAt: "2026-10-18T05:09:40.000Z",
      description: "",
    },
  ],
};

export const CARRIERS = [
  { name: "mock", label: "Hãng giả (thử nghiệm)", ready: true, missing: [] },
  { name: "self", label: "Shop tự giao", ready: true, missing: [] },
  { name: "ghn", label: "Giao Hàng Nhanh", ready: true, missing: [] },
  {
    name: "ghtk",
    label: "Giao Hàng Tiết Kiệm",
    ready: false,
    missing: ["GHTK_TOKEN"],
  },
  { name: "vtp", label: "Viettel Post", ready: false, missing: ["VTP_USERNAME"] },
  {
    name: "ahamove",
    label: "AhaMove (nội thành)",
    ready: false,
    missing: ["AHAMOVE_API_KEY"],
  },
];

/** Dữ liệu trang công khai — đã che bớt đúng như backend trả về. */
export const TRACKING_CONG_KHAI = {
  trackingCode: "GHN7728491",
  carrier: "ghn",
  status: "IN_TRANSIT",
  lastSyncedAt: "2026-10-18T06:00:00.000Z",
  createdAt: "2026-10-18T05:09:48.000Z",
  recipientName: "Nguyễn Thuỳ T.",
  recipientPhone: "0984***899",
  area: "Phường Bến Thành, TP. Hồ Chí Minh",
  events: [
    {
      mappedStatus: "IN_TRANSIT",
      occurredAt: "2026-10-18T06:00:00.000Z",
      description: "Đang luân chuyển",
    },
    {
      mappedStatus: "PICKED_UP",
      occurredAt: "2026-10-18T05:30:00.000Z",
      description: "Bưu tá đã lấy hàng",
    },
  ],
};

export const TRACKING_CHUA_CO_MA = {
  ...TRACKING_CONG_KHAI,
  trackingCode: null,
  status: "REQUESTED",
  events: [],
};

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
    shipments = [SHIP_CHO_LAY, SHIP_DANG_DI, SHIP_HONG, SHIP_TU_GIAO],
    shipmentDetail = SHIP_DETAIL,
    tracking = TRACKING_CONG_KHAI,
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

    if (path.startsWith("/payments/by-ref/")) {
      const ref = decodeURIComponent(path.slice("/payments/by-ref/".length));
      const payment = payments.find((p) => (p as { txnRef?: string }).txnRef === ref);
      return payment ? json(route, payment) : json(route, { message: "Không tìm thấy giao dịch" }, 404);
    }

    // Phải xét TRƯỚC "/shipments/:id", nếu không "carriers" bị nuốt
    // thành một id.
    if (path === "/shipments/carriers") {
      return json(route, { items: CARRIERS });
    }

    if (path === "/shipments") {
      return json(route, { items: shipments });
    }

    if (path.startsWith("/tracking/")) {
      return tracking
        ? json(route, tracking)
        : json(route, { error: "TRACKING_NOT_FOUND" }, 404);
    }

    if (path.startsWith("/shipments/")) {
      return shipmentDetail
        ? json(route, shipmentDetail)
        : json(route, { error: "SHIPMENT_NOT_FOUND" }, 404);
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
