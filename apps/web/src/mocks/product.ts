export * from "@/features/product/types";

import type { ProductItem, ProductKpiSummary } from "@/features/product/types";

export const productKpiData: ProductKpiSummary = {
  totalProducts: 248,
  totalProductsNote: "+14 mã mới trong tuần",
  activeLiveProducts: 42,
  activeLiveNote: "Ghim trực tiếp trên stream",
  lowStockCount: 6,
  lowStockNote: "Cần bổ sung kho lập tức",
  inactiveCount: 12,
  inactiveNote: "Đã lưu trữ cuối kỳ",
};

export const productMockList: ProductItem[] = [
  {
    id: "AO01",
    sku: "SP-LINEN-001",
    name: "Áo sơ mi Linen Cổ Tàu Form Rộng",
    category: "Áo sơ mi",
    variantDetails: "Áo sơ mi • Trắng, Be, Xanh Pastel",
    livePrice: 299_000,
    originalPrice: 420_000,
    availableStock: 142,
    reservedStock: 18,
    status: "active",
    isBestSeller: true,
    isPinned: true,
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuA7Y6Z3s4bhId1O7GnYR7Ayp8LkiLBAybZBWsBv1sWKh7R2P2M6OSKddTRDJk0EFvN3EMxn4sEOmGuuJqWbfaDmDB-n2QKGpNVoDo-1spqye1Jwdd2cpU39zeG5Y7la7Rn343benZf_B2vCi74g33FcVNrECAOMvzv8PGrP2NI2osq9BwRGnJ8LzuGb744Cn15d2jwKFF4PLP9X00_RJj2nNQ7vliaz2MbR83s9dSL54U23AZdAmE_R",
  },
  {
    id: "DM02",
    sku: "SP-DRESS-008",
    name: "Đầm Suông Tay Bồng Phong Cách Pháp",
    category: "Đầm & Váy",
    variantDetails: "Đầm & Váy • Tím Pastel, Trắng Ngà",
    livePrice: 450_000,
    originalPrice: 580_000,
    availableStock: 56,
    reservedStock: 24,
    status: "active",
    isBestSeller: false,
    isPinned: true,
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD36CsPoA0ZYop2mCs__qX9wkqyTik3HRi66TBEyyx5QCkL0xDKyc3MofpiBdu0v-XSQlXtBbpiqQgvWY9t204aygm-iwSqgFyv39lEBJplSV7FGbPrf8jUkIXnc2LRXr2mRFdp6kfTxAG-vniep6taBbrylFo6MQ-7BSYMmjlbjrMSfnFRLp4YMcbTrfDqql-xxckZF6ACG0zSTlpuQypam8DDjKffLiYg2JaexKKtnEI8aoWVu4ke",
  },
  {
    id: "JN04",
    sku: "SP-JEAN-044",
    name: "Quần Jean Ống Suông Lưng Cao Vintage",
    category: "Quần jean",
    variantDetails: "Quần jean • Xanh Denim Nhạt",
    livePrice: 389_000,
    originalPrice: 480_000,
    availableStock: 4,
    reservedStock: 12,
    status: "low_stock",
    isBestSeller: false,
    isPinned: false,
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBte7hiUBP7NtvfXTIYb7XNRlHS8W76Ym9EdIt2LoJIPAPNWOD9GpHc-KvWh3h48KHjrFQTmxWgd2QNWNhLMhLGxW1Jr3bIyAuzKZMvFMQ3jU0PLpOYF62eC8ZYZBD80C9kTUdMJEJsZKkLunVKSL1pyUFGRZe3mM9paY8jHModYJzrtevBbSJ7B4b5HAKyhBmtx7Of3CUBdBvdtnPrKU9RpepTkOh0LvlhbVDD2gW6HcwyrSxBgERN",
  },
  {
    id: "PK03",
    sku: "SP-ACC-019",
    name: "Set Khăn Lụa Satin Họa Tiết Monogram",
    category: "Phụ kiện",
    variantDetails: "Phụ kiện • Họa tiết Cổ điển",
    livePrice: 150_000,
    originalPrice: 220_000,
    availableStock: 0,
    reservedStock: 0,
    status: "out_of_stock",
    isBestSeller: false,
    isPinned: false,
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDgcxf5rBHGDcdIyMFAvY0yZVedXtqtrQIw5xx0Wz1vsfbyJZSPMKUnamcqtRX7IbksUSxCk44gUWLcK5wSW1UuE9I0u8V7qA9eCbnrs9rk1KWw15JkvhR3DCiJG_Cxwb4KF_gMJYTlfqOFtA_eUUMButR6Izd3B3zDEb0cIV_SXrgJ9NoMDOPr7AHfzKgVIEr-fPLfkut69wc5E1i-bWKJ5akpiEWgTFzLEZ4cyiQL-MtcpVdKVV49",
  },
  {
    id: "AT99",
    sku: "SP-TSHIRT-OLD",
    name: "Áo Thun Unisex 250GSM Phiên bản Hè 2023",
    category: "Áo thun",
    variantDetails: "Áo thun • Đen Washed (Model cũ)",
    livePrice: 199_000,
    availableStock: 0,
    reservedStock: 0,
    status: "inactive",
    isBestSeller: false,
    isPinned: false,
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuC-k5xMm-ebjvJo9xpjr86E4rdONgZYrW7RIEIzU4EqKH6pk6e95dJuXKbZ9J3-F2tWoOV4khXbywzItWFpwZiHSt0lVXcqz8vGuAtyo52GUP-KhSUHubnKIjaBXxy35YXQp4B2NEV9F4z4tnQTcS_JT7YJQj03AhI-bGa-lz9RdytZ3yUp30jQSwKeNCg4CJpsIUCm7HJBBmQ-j3zSqYXZ1j6JXitz5hN0tqnawGXJe-cXOUP8e7rM",
  },
  {
    id: "DM05",
    sku: "SP-DRESS-021",
    name: "Đầm Voan Tơ Hoa Nhí Cổ Vuông",
    category: "Đầm & Váy",
    variantDetails: "Đầm & Váy • Hoa Nhí Vàng, Xanh",
    livePrice: 395_000,
    originalPrice: 490_000,
    availableStock: 88,
    reservedStock: 9,
    status: "active",
    isBestSeller: true,
    isPinned: false,
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuA6yhcWLoUHJM8kYy1i9KzGWLnbOe6lGpXkY8DswDZdsd2WoooEcPsHs898th24hhThLkJavE8E1KshxMvKVxrqbez7VxPSFJBjvFaE61QhWODveIWgISXdtvGhpc5CR_hT5lyypbOBvaPD8XjYNXUsCaVqGPaKM1lhxDcC6scQwDPi6vBc6p4dPioyjSG_dQig2WaOiCDcBIlbAU-aPIbimamroZ4bSJ80WSsTjtWcDdwq7MoIKS65",
  },
];

// Backward compatibility exports
export const initialProducts = productMockList;
export const initialProductMetrics = [
  {
    label: "Tổng sản phẩm",
    value: "248",
    note: "+14 mã mới trong tuần",
  },
  {
    label: "Đang mở bán trên Live",
    value: "42",
    note: "Ghim trực tiếp trên stream",
    tone: "success" as const,
  },
  {
    label: "Sắp hết hàng",
    value: "6",
    note: "Cần bổ sung kho lập tức",
    tone: "warning" as const,
  },
  {
    label: "Đã ngừng bán",
    value: "12",
    note: "Đã lưu trữ cuối kỳ",
  },
];
