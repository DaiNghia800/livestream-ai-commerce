"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ProductKpiCards } from "@/components/ui/product-metrics-bar";
import { ProductTable } from "@/components/ui/product-table";
import { AddProductDialog } from "@/components/ui/add-product-dialog";
import {
  productMockList,
  productKpiData,
  type ProductItem,
} from "@/mocks/product";

export function MerchantProduct() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductItem[]>(productMockList);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [filterBestSellerOnly, setFilterBestSellerOnly] = useState(false);
  const [filterLivePinOnly, setFilterLivePinOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q);

      const matchesCat =
        !categoryFilter ||
        (categoryFilter === "ao-so-mi" && p.category === "Áo sơ mi") ||
        (categoryFilter === "dam-vay" && p.category === "Đầm & Váy") ||
        (categoryFilter === "quan-jean" && p.category === "Quần jean") ||
        (categoryFilter === "phu-kien" && p.category === "Phụ kiện") ||
        (categoryFilter === "ao-thun" && p.category === "Áo thun");

      const matchesStatus =
        !statusFilter ||
        (statusFilter === "dang-ban" &&
          (p.status === "active" || p.status === "low_stock")) ||
        (statusFilter === "het-hang" && p.status === "out_of_stock") ||
        (statusFilter === "ngung-ban" && p.status === "inactive");

      const matchesBestSeller = !filterBestSellerOnly || Boolean(p.isBestSeller);
      const matchesLivePin = !filterLivePinOnly || Boolean(p.isPinned);

      return (
        matchesSearch &&
        matchesCat &&
        matchesStatus &&
        matchesBestSeller &&
        matchesLivePin
      );
    });
  }, [
    products,
    searchQuery,
    categoryFilter,
    statusFilter,
    filterBestSellerOnly,
    filterLivePinOnly,
  ]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map((p) => p.id));
    }
  };

  const handleToggleStatus = (id: string) => {
    setProducts((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const newStatus =
            item.status === "inactive"
              ? item.availableStock > 0
                ? "active"
                : "out_of_stock"
              : "inactive";
          return { ...item, status: newStatus };
        }
        return item;
      })
    );
  };

  const handleAddProduct = (newProd: ProductItem) => {
    setProducts((prev) => [newProd, ...prev]);
  };

  const handleEdit = (product: ProductItem) => {
    alert(`Chỉnh sửa thông tin sản phẩm: ${product.name} (${product.id})`);
  };

  return (
    <>
      {/* ==================== SCREEN HEADER ==================== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-headline-lg font-headline-lg text-on-surface font-bold">
            Quản lý Sản phẩm
          </h1>
          <p className="text-body-md font-body-md text-on-surface-variant mt-0.5">
            Cấu hình danh mục hàng hóa, phân bổ số lượng chốt trực tiếp và kiểm soát tồn kho trong buổi phát trực tiếp.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            className="h-10 px-3.5 rounded-lg border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-high text-on-surface-variant text-label-md font-label-md font-medium inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            type="button"
            onClick={() => alert("Đang xuất danh sách sản phẩm...")}
          >
            <span className="material-symbols-outlined text-[18px]" data-icon="download">
              download
            </span>
            <span>Xuất danh sách</span>
          </button>
          <button
            className="h-10 px-3.5 rounded-lg border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-high text-on-surface-variant text-label-md font-label-md font-medium inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            type="button"
            onClick={() => alert("Nhập tệp Excel sản phẩm...")}
          >
            <span className="material-symbols-outlined text-[18px]" data-icon="upload_file">
              upload_file
            </span>
            <span>Nhập file Excel</span>
          </button>
          <button
            className="h-10 px-4 rounded-lg bg-primary-container hover:bg-primary text-on-primary text-label-md font-headline-md font-semibold inline-flex items-center gap-2 shadow-sm transition-transform active:scale-[0.98] border-none cursor-pointer"
            type="button"
            onClick={() => router.push("/shop/products/new")}
          >
            <span className="material-symbols-outlined text-[18px]" data-icon="add">
              add
            </span>
            <span>+ Thêm sản phẩm mới</span>
          </button>
        </div>
      </div>

      {/* ==================== 4 KPI HEADER CARDS (Bento Grid Style) ==================== */}
      <ProductKpiCards kpi={productKpiData} />

      {/* ==================== ACTION BAR & FILTERS ==================== */}
      <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/60 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Multi-Criteria */}
        <div className="w-full md:w-96 relative">
          <span
            className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline pointer-events-none"
            data-icon="search"
          >
            search
          </span>
          <input
            className="w-full h-10 pl-9 pr-4 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm font-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            placeholder="Tìm theo Tên SP, SKU, Mã chốt đơn (VD: AO01, SP-LINEN)..."
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filters Row */}
        <div className="w-full md:w-auto flex flex-wrap items-center gap-2.5">
          {/* Category Filter */}
          <div className="relative min-w-[150px]">
            <select
              className="w-full h-10 pl-3 pr-8 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm font-body-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">Tất cả danh mục</option>
              <option value="ao-so-mi">Áo sơ mi</option>
              <option value="dam-vay">Đầm &amp; Váy</option>
              <option value="quan-jean">Quần jean</option>
              <option value="phu-kien">Phụ kiện</option>
            </select>
            <span
              className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[18px] text-outline pointer-events-none"
              data-icon="expand_more"
            >
              expand_more
            </span>
          </div>

          {/* Status Filter */}
          <div className="relative min-w-[140px]">
            <select
              className="w-full h-10 pl-3 pr-8 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm font-body-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="dang-ban">Đang bán</option>
              <option value="het-hang">Hết hàng</option>
              <option value="ngung-ban">Ngừng bán</option>
            </select>
            <span
              className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[18px] text-outline pointer-events-none"
              data-icon="expand_more"
            >
              expand_more
            </span>
          </div>

          {/* Quick Filter Chips */}
          <div className="hidden xl:flex items-center gap-1.5 pl-2 border-l border-outline-variant/60">
            <button
              className={`px-2.5 py-1.5 rounded-full text-label-sm font-label-sm font-medium flex items-center gap-1 transition-colors border-none cursor-pointer ${
                filterBestSellerOnly
                  ? "bg-primary text-on-primary shadow-sm"
                  : "bg-surface-container-high text-primary hover:bg-surface-container"
              }`}
              type="button"
              onClick={() => setFilterBestSellerOnly((v) => !v)}
            >
              <span className="material-symbols-outlined text-[14px]" data-icon="star">
                star
              </span>
              <span>Best Seller</span>
            </button>
            <button
              className={`px-2.5 py-1.5 rounded-full text-label-sm font-label-sm font-medium flex items-center gap-1 transition-colors border-none cursor-pointer ${
                filterLivePinOnly
                  ? "bg-primary text-on-primary shadow-sm"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
              type="button"
              onClick={() => setFilterLivePinOnly((v) => !v)}
            >
              <span className="material-symbols-outlined text-[14px]" data-icon="push_pin">
                push_pin
              </span>
              <span>Live Pin</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================== PRODUCT DATA TABLE ==================== */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] overflow-hidden">
        <ProductTable
          products={filteredProducts}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onToggleStatus={handleToggleStatus}
          onEdit={handleEdit}
        />

        {/* ==================== SAAS PROFESSIONAL PAGINATION FOOTER ==================== */}
        <div className="px-6 py-4 border-t border-outline-variant/60 flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-container-lowest select-none">
          {/* Left: Range Information */}
          <div className="text-body-sm font-body-sm text-on-surface-variant flex items-center gap-2">
            <span>
              Hiển thị <strong className="font-semibold text-on-surface">1 - {Math.min(pageSize, filteredProducts.length)}</strong> trên tổng số{" "}
              <strong className="font-semibold text-on-surface">248</strong> sản phẩm
            </span>
            <span className="text-outline">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-label-sm font-label-sm text-outline">Số hàng:</span>
              <select
                className="h-8 py-0 pl-2 pr-6 bg-surface-container-low border border-outline-variant/60 rounded text-label-sm font-label-sm text-on-surface focus:outline-none focus:border-primary cursor-pointer"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {/* Right: Navigation Pages */}
          <div className="flex items-center gap-1.5">
            <button
              className="h-8 px-2 rounded-lg border border-outline-variant/60 text-outline hover:bg-surface-container hover:text-on-surface disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1 text-label-sm font-label-sm cursor-pointer"
              disabled={currentPage === 1}
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <span className="material-symbols-outlined text-[16px]" data-icon="chevron_left">
                chevron_left
              </span>
              <span className="hidden sm:inline">Trước</span>
            </button>
            <button
              className={`w-8 h-8 rounded-lg font-headline-md text-label-sm font-semibold flex items-center justify-center cursor-pointer border-none ${
                currentPage === 1
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container transition-colors"
              }`}
              type="button"
              onClick={() => setCurrentPage(1)}
            >
              1
            </button>
            <button
              className={`w-8 h-8 rounded-lg font-headline-md text-label-sm font-semibold flex items-center justify-center cursor-pointer border-none ${
                currentPage === 2
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container transition-colors"
              }`}
              type="button"
              onClick={() => setCurrentPage(2)}
            >
              2
            </button>
            <button
              className={`w-8 h-8 rounded-lg font-headline-md text-label-sm font-semibold flex items-center justify-center cursor-pointer border-none ${
                currentPage === 3
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container transition-colors"
              }`}
              type="button"
              onClick={() => setCurrentPage(3)}
            >
              3
            </button>
            <span className="w-6 text-center text-outline text-label-sm font-semibold">...</span>
            <button
              className={`w-8 h-8 rounded-lg font-headline-md text-label-sm font-semibold flex items-center justify-center cursor-pointer border-none ${
                currentPage === 25
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container transition-colors"
              }`}
              type="button"
              onClick={() => setCurrentPage(25)}
            >
              25
            </button>
            <button
              className="h-8 px-2 rounded-lg border border-outline-variant/60 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors flex items-center gap-1 text-label-sm font-label-sm cursor-pointer"
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(25, p + 1))}
            >
              <span className="hidden sm:inline">Sau</span>
              <span className="material-symbols-outlined text-[16px]" data-icon="chevron_right">
                chevron_right
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================== CONTEXTUAL BOTTOM BANNER: AI AUTO RECOGNITION SUMMARY ==================== */}
      <div className="p-4 rounded-xl bg-surface-container border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-body-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-container text-on-primary flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[20px]" data-icon="smart_toy">
              smart_toy
            </span>
          </div>
          <div>
            <span className="font-semibold text-primary block">AI Parser Đang Hoạt Động (Độ nhạy: 99.4%)</span>
            <span className="text-on-surface-variant text-label-sm">
              Hệ thống đang tự động nhận diện các cú pháp chốt đơn trong Live chat theo công thức:{" "}
              <strong>[Mã Chốt Đơn] + [Màu/Size] + [SĐT]</strong>.
            </span>
          </div>
        </div>
        <button
          className="text-primary font-headline-md text-label-sm font-semibold hover:underline flex-shrink-0 flex items-center gap-1 bg-transparent border-none cursor-pointer"
          type="button"
          onClick={() => alert("Cấu hình bộ quy tắc AI")}
        >
          <span>Cấu hình bộ quy tắc AI</span>
          <span className="material-symbols-outlined text-[16px]" data-icon="arrow_forward">
            arrow_forward
          </span>
        </button>
      </div>

      {/* Modal Thêm sản phẩm */}
      <AddProductDialog
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddProduct}
      />
    </>
  );
}
