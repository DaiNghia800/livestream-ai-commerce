export const products = [
  {
    id: "A001",
    name: "Áo sơ mi Linen cổ tàu",
    price: 199000,
    stock: 48,
    color: "linen",
  },
  {
    id: "DM02",
    name: "Đầm Maxi Linen cột nơ",
    price: 249000,
    stock: 25,
    color: "sky",
  },
  {
    id: "QJ02",
    name: "Quần suông Linen ống rộng",
    price: 220000,
    stock: 60,
    color: "sage",
  },
];
export const comments = [
  {
    name: "Thu Trang",
    content: "Áo linen này form dài qua mông không shop ơi?",
  },
  { name: "Hoàng Minh", content: "Áo chất vải dày dặn hay mỏng vậy mẫu?" },
  { name: "Nguyễn Lan Hương", content: "A001 x1 màu be nhé shop" },
];
export const orders = [
  {
    id: "ORD-8821",
    customer: "Lê Thùy Dung",
    product: "Áo sơ mi Linen × 2",
    total: 398000,
    status: "paid",
  },
  {
    id: "ORD-8820",
    customer: "Trần Quốc Bảo",
    product: "Quần suông Linen × 1",
    total: 220000,
    status: "confirmed",
  },
  {
    id: "ORD-8819",
    customer: "Nguyễn Hoàng Nam",
    product: "Đầm Maxi Linen × 1",
    total: 249000,
    status: "pending",
  },
] as const;
export const metrics = [
  {
    label: "Livestream đang phát",
    value: "2 phiên",
    note: "3.420 người đang xem",
  },
  { label: "Đơn hàng hôm nay", value: "1.248", note: "+18,4% so với hôm qua" },
  { label: "Chờ xác nhận", value: "142", note: "28 khách gọi chốt ngay" },
  {
    label: "Doanh thu hôm nay",
    value: "348,5 triệu",
    note: "87% mục tiêu trong ngày",
  },
];
export const revenue = [
  { hour: "18:00", value: 32 },
  { hour: "19:00", value: 52 },
  { hour: "20:00", value: 92 },
  { hour: "21:00", value: 81 },
  { hour: "22:00", value: 56 },
  { hour: "23:00", value: 30 },
];
