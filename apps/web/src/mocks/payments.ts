export const paymentStatuses = {
  PAID: { label: "Đã thanh toán", tone: "success" },
  PENDING: { label: "Chờ thanh toán", tone: "warning" },
  FAILED: { label: "Thất bại", tone: "danger" },
  REFUNDED: { label: "Đã hoàn tiền", tone: "neutral" },
} as const;

export const paymentGateways = {
  VNPAY: "VNPay QR",
  MOMO: "Ví MoMo",
  COD: "Thu hộ khi giao (COD)",
} as const;

export const payments = [
  {
    txnRef: "VNP-20250620-889412",
    orderCode: "ORD-9942",
    gateway: "VNPAY",
    status: "PAID",
    amount: 388_000,
    createdAt: "2025-06-20T19:48:10+07:00",
    settledAt: "2025-06-20T19:48:22+07:00",
    holdSecondsLeft: null,
    customer: "Nguyễn Thuỳ Trang",
    breakdown: { gross: 398_000, discount: 10_000, fee: 5_368 },
    timeline: [
      {
        at: "2025-06-20T19:48:10+07:00",
        title: "Khách chọn thanh toán VNPay QR",
        detail: "Hệ thống sinh mã QR động cho số tiền 388.000 ₫.",
      },
      {
        at: "2025-06-20T19:48:15+07:00",
        title: "Khách quét mã trên ứng dụng ngân hàng",
        detail: "Đơn hàng tiếp tục được giữ tồn trong lúc chờ kết quả.",
      },
      {
        at: "2025-06-20T19:48:22+07:00",
        title: "Cổng thanh toán báo thành công",
        detail: "Đơn chuyển sang Đã xác nhận, đồng hồ giữ hàng được gỡ.",
      },
      {
        at: "2025-06-20T19:48:23+07:00",
        title: "Lượt giữ hàng chuyển HELD sang COMMITTED",
        detail: "Tồn thực tế và tồn giữ chỗ cùng giảm 2 sản phẩm.",
      },
    ],
  },
  {
    txnRef: "MOMO-20250620-771920",
    orderCode: "ORD-9938",
    gateway: "MOMO",
    status: "PAID",
    amount: 280_000,
    createdAt: "2025-06-20T19:38:04+07:00",
    settledAt: "2025-06-20T19:38:19+07:00",
    holdSecondsLeft: null,
    customer: "Đỗ Mỹ Linh",
    breakdown: { gross: 280_000, discount: 0, fee: 5_900 },
    timeline: [
      {
        at: "2025-06-20T19:38:04+07:00",
        title: "Khách mở ví MoMo từ link xác nhận",
        detail: "Đơn đang ở trạng thái chờ xác nhận.",
      },
      {
        at: "2025-06-20T19:38:19+07:00",
        title: "Ví MoMo báo thanh toán thành công",
        detail: "Đơn chuyển sang Đã xác nhận.",
      },
    ],
  },
  {
    txnRef: "VNP-20250620-552194",
    orderCode: "ORD-9940",
    gateway: "VNPAY",
    status: "PENDING",
    amount: 620_000,
    createdAt: "2025-06-20T19:44:12+07:00",
    settledAt: null,
    holdSecondsLeft: 512,
    customer: "Võ Thị Cẩm Tiên",
    breakdown: { gross: 620_000, discount: 0, fee: 0 },
    timeline: [
      {
        at: "2025-06-20T19:44:12+07:00",
        title: "Đã sinh mã QR, đang chờ khách quét",
        detail: "Tồn kho vẫn đang được giữ cho tới khi hết hạn.",
      },
    ],
  },
  {
    txnRef: "MOMO-20250620-449102",
    orderCode: "ORD-9937",
    gateway: "MOMO",
    status: "REFUNDED",
    amount: -320_000,
    createdAt: "2025-06-20T19:36:02+07:00",
    settledAt: "2025-06-20T19:42:12+07:00",
    holdSecondsLeft: null,
    customer: "Hoàng Văn Kiên",
    breakdown: { gross: 320_000, discount: 0, fee: 0 },
    timeline: [
      {
        at: "2025-06-20T19:36:02+07:00",
        title: "Khách thanh toán thành công",
        detail: "Đơn được xác nhận.",
      },
      {
        at: "2025-06-20T19:41:30+07:00",
        title: "Nhân viên hủy đơn theo yêu cầu khách",
        detail: "Lượt giữ hàng chuyển sang RELEASED, tồn trả về kho.",
      },
      {
        at: "2025-06-20T19:42:12+07:00",
        title: "Khởi tạo hoàn tiền",
        detail: "Chưa kết nối cổng hoàn tiền trong bản mẫu.",
      },
    ],
  },
  {
    txnRef: "COD-20250620-338210",
    orderCode: "ORD-9939",
    gateway: "COD",
    status: "PENDING",
    amount: 750_000,
    createdAt: "2025-06-20T19:40:20+07:00",
    settledAt: null,
    holdSecondsLeft: null,
    customer: "Phạm Quốc Bảo",
    breakdown: { gross: 750_000, discount: 0, fee: 0 },
    timeline: [
      {
        at: "2025-06-20T19:40:20+07:00",
        title: "Đơn chọn thu hộ khi giao",
        detail: "Tiền sẽ được đối soát sau khi đơn vị vận chuyển giao thành công.",
      },
    ],
  },
  {
    txnRef: "VNP-20250620-664811",
    orderCode: "ORD-9936",
    gateway: "VNPAY",
    status: "FAILED",
    amount: 249_000,
    createdAt: "2025-06-20T19:28:45+07:00",
    settledAt: null,
    holdSecondsLeft: null,
    customer: "Lý Thu Hà",
    breakdown: { gross: 249_000, discount: 0, fee: 0 },
    timeline: [
      {
        at: "2025-06-20T19:28:45+07:00",
        title: "Đã sinh mã QR",
        detail: "Khách không hoàn tất trong thời gian giữ hàng.",
      },
      {
        at: "2025-06-20T19:43:45+07:00",
        title: "Hết hạn giữ hàng, giao dịch bị hủy",
        detail: "Lượt giữ hàng chuyển sang EXPIRED, tồn trả về kho.",
      },
    ],
  },
] as const;

export type Payment = (typeof payments)[number];

export const findPayment = (txnRef: string) =>
  payments.find((item) => item.txnRef.toLowerCase() === txnRef.toLowerCase());
