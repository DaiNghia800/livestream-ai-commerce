export const liveSession = {
  id: "LIVE-2025-08",
  title: "Đại tiệc Flash Sale BST Linen Hè 2025",
  startedAt: "19:30",
  duration: "01:24:35",
  viewers: "4.820",
  peakViewers: "5.600",
  commentsPerMinute: "380",
  aiOrders: "642",
  temporaryRevenue: 186_400_000,
};

export const liveSessionMetrics = [
  { label: "Thời gian phát", value: liveSession.duration, note: `Bắt đầu lúc ${liveSession.startedAt}` },
  { label: "Kết nối phiên", value: "Chưa kết nối", note: "Amazon IVS sẽ được tích hợp sau", tone: "warning" },
  { label: "Đang xem", value: liveSession.viewers, note: `Đỉnh: ${liveSession.peakViewers}` },
  { label: "Bình luận", value: `${liveSession.commentsPerMinute}/phút`, note: "Dữ liệu minh họa" },
  { label: "Gemini AI", value: liveSession.aiOrders, note: "Đơn chốt tự động mẫu", tone: "ai" },
] as const;

export const liveSessionProducts = [
  { id: "A001", sku: "LIN-CU-25", name: "Áo sơ mi Linen cổ cuban thoáng khí", price: 289_000, inventory: "84 / 300", orders: 216, status: "Đang ghim" },
  { id: "QU02", sku: "PAN-LNN-02", name: "Quần ống suông Linen lưng thun unisex", price: 345_000, inventory: "142 / 250", orders: 108, status: "Chờ ghim" },
  { id: "VA03", sku: "DRS-TIER-08", name: "Váy đầm Linen dáng suông thắt nơ lưng", price: 399_000, inventory: "18 / 180", orders: 162, status: "Sắp cháy hàng" },
  { id: "GL04", sku: "VST-SAF-11", name: "Áo gile khoác ngoài Safari Linen", price: 260_000, inventory: "95 / 150", orders: 55, status: "Chờ ghim" },
  { id: "BZ05", sku: "BLZ-OAT-09", name: "Áo Blazer Linen một lớp công sở", price: 495_000, inventory: "61 / 120", orders: 53, status: "Chờ ghim" },
] as const;
