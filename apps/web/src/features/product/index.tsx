"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  Upload,
  Plus,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Bot,
  ArrowRight,
} from "lucide-react";
import { ProductKpiCards } from "@/components/ui/product-metrics-bar";
import { ProductTable } from "@/components/ui/product-table";
import styles from "./product.module.css";
import {
  exportProducts,
  getProductCategories,
  getProducts,
  importProducts,
  updateProductStatus,
} from "./api/products";
import type { ProductCategory } from "./api/products";
import type { CatalogProductSummary, ProductListItem } from "./types";

export function MerchantProduct() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [summary, setSummary] = useState<CatalogProductSummary>({
    totalProducts: 0,
    activeProducts: 0,
    skuCount: 0,
    inactiveProducts: 0,
  });
  const [totalProducts, setTotalProducts] = useState(0);
  const [loadedQuery, setLoadedQuery] = useState("");
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestKey = `${searchQuery}|${categoryFilter}|${statusFilter}|${currentPage}|${pageSize}|${refreshKey}`;
  const loading = loadedQuery !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    getProductCategories(controller.signal)
      .then(setCategories)
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError(requestError instanceof Error ? requestError.message : "Không thể tải danh mục.");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getProducts({
      q: searchQuery.trim() || undefined,
      categoryId: categoryFilter || undefined,
      status: statusFilter || undefined,
      page: currentPage,
      pageSize,
    }, controller.signal)
      .then((result) => {
        setError("");
        setProducts(result.data);
        setSummary(result.summary);
        setTotalProducts(result.total);
        setLoadedQuery(requestKey);
      })
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError(requestError instanceof Error ? requestError.message : "Không thể tải sản phẩm.");
          setLoadedQuery(requestKey);
        }
      });
    return () => controller.abort();
  }, [searchQuery, categoryFilter, statusFilter, currentPage, pageSize, refreshKey, requestKey]);

  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize));
  const firstProduct = totalProducts === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastProduct = Math.min(currentPage * pageSize, totalProducts);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map((p) => p.id));
    }
  };

  const handleToggleStatus = async (id: string) => {
    const product = products.find((item) => item.id === id);
    if (!product) return;
    try {
      await updateProductStatus(id, product.status === "active" ? "archived" : "active");
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể cập nhật sản phẩm.");
    }
  };

  const handleEdit = (product: ProductListItem) => {
    router.push(`/shop/products/${product.id}/edit`);
  };

  const handleExport = async () => {
    setError("");
    setIsExporting(true);
    try {
      const file = await exportProducts({
        q: searchQuery.trim() || undefined,
        categoryId: categoryFilter || undefined,
        status: statusFilter || undefined,
      });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "products.xlsx";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể xuất Excel.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setError("");
    setImportMessage("");
    setIsImporting(true);
    try {
      const result = await importProducts(file);
      setImportMessage(`Đã nhập ${result.products} sản phẩm và ${result.skus} SKU.`);
      setCurrentPage(1);
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể nhập Excel.");
    } finally {
      setIsImporting(false);
      input.value = "";
    }
  };

  return (
    <>
      {/* ==================== SCREEN HEADER ==================== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-headline-lg text-on-surface font-bold">
            Quản lý Sản phẩm
          </h1>
          <p className="text-body-md font-body-md text-on-surface-variant mt-0.5">
            Cấu hình danh mục hàng hóa, phân bổ số lượng chốt trực tiếp và kiểm soát tồn kho trong buổi phát trực tiếp.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            className="h-10 whitespace-nowrap px-3.5 rounded-lg border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-high text-sm font-label-md font-medium inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            type="button"
            disabled={isExporting}
            onClick={handleExport}
          >
            <Download size={18} aria-hidden="true" />
            <span>{isExporting ? "Đang xuất..." : "Xuất danh sách"}</span>
          </button>
          <button
            className="h-10 whitespace-nowrap px-3.5 rounded-lg border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-high text-sm font-label-md font-medium inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            type="button"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={18} aria-hidden="true" />
            <span>{isImporting ? "Đang nhập..." : "Nhập file Excel"}</span>
          </button>
          <input
            ref={fileInputRef}
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleImport}
            type="file"
          />
          <Link
            role="button"
            href="/shop/products/new"
            className="h-10 whitespace-nowrap px-4 rounded-lg bg-primary-container hover:bg-primary text-on-primary text-sm font-headline-md font-semibold inline-flex items-center gap-2 shadow-sm transition-transform active:scale-[0.98] border-none cursor-pointer hover:no-underline"
          >
            <Plus size={18} aria-hidden="true" />
            <span>Thêm sản phẩm mới</span>
          </Link>
        </div>
      </div>

      {/* ==================== 4 KPI HEADER CARDS (Bento Grid Style) ==================== */}
      <ProductKpiCards kpi={summary} />

      {error && (
        <div role="alert" className="rounded-lg border border-error/30 bg-error-container/30 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {importMessage && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {importMessage}
        </div>
      )}

      {/* ==================== ACTION BAR & FILTERS ==================== */}
      <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/60 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] flex flex-nowrap items-center gap-3 overflow-x-auto">
        {/* Search Multi-Criteria */}
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none"
            aria-hidden="true"
          />
          <input
            className={`${styles.filterSearchInput} w-full bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm font-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all`}
            placeholder="Tìm tên, SKU hoặc mã chốt đơn..."
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        {/* Filters Row */}
        <div className="flex w-auto shrink-0 flex-nowrap items-center gap-2.5 overflow-visible">
          {/* Category Filter */}
          <div className="relative w-[160px] shrink-0">
            <select
              aria-label="Lọc theo danh mục"
              className={`${styles.filterSelect} w-full min-w-0 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm font-body-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer`}
              title={
                categories.find((category) => String(category.id) === categoryFilter)?.name ??
                "Tất cả danh mục"
              }
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">Tất cả danh mục</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <ChevronDown
              size={18}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none"
              aria-hidden="true"
            />
          </div>

          {/* Status Filter */}
          <div className="relative w-[160px] shrink-0">
            <select
              aria-label="Lọc theo trạng thái"
              className={`${styles.filterSelect} w-full min-w-0 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm font-body-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer`}
              title={statusFilter ? "Lọc theo trạng thái Catalog" : "Tất cả trạng thái"}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="active">Đang bán</option>
              <option value="archived">Đã lưu trữ</option>
              <option value="discontinued">Ngừng kinh doanh</option>
            </select>
            <ChevronDown
              size={18}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none"
              aria-hidden="true"
            />
          </div>

        </div>
      </div>

      {/* ==================== PRODUCT DATA TABLE ==================== */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] overflow-hidden">
        <ProductTable
          products={products}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onToggleStatus={handleToggleStatus}
          onEdit={handleEdit}
          loading={loading}
        />

        {/* ==================== SAAS PROFESSIONAL PAGINATION FOOTER ==================== */}
        <div className={`${styles.productTableFooter} border-outline-variant/60 bg-surface-container-lowest select-none`}>
          {/* Left: Range Information */}
          <div className={`${styles.productPageInfo} text-body-sm font-body-sm text-on-surface-variant`}>
            <span>
              Hiển thị <strong className="font-semibold text-on-surface">{firstProduct} - {lastProduct}</strong> trên tổng số{" "}
              <strong className="font-semibold text-on-surface">{totalProducts}</strong> sản phẩm
            </span>
            <span className="text-outline">|</span>
            <label className={`${styles.productPageSize} text-xs font-label-sm text-outline`}>
              Số hàng:
              <select
                aria-label="Số hàng mỗi trang"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>

          {/* Right: Navigation Pages */}
          <div className={`${styles.productPagination} text-xs font-label-sm`}>
            <button
              className="h-8 px-2 rounded-lg border border-outline-variant/60 text-outline hover:bg-surface-container hover:text-on-surface disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1 text-xs font-label-sm cursor-pointer"
              disabled={currentPage === 1 || loading}
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Trước</span>
            </button>
            <span aria-live="polite" className="px-2 text-on-surface-variant">
              Trang {currentPage} / {totalPages}
            </span>
            <button
              className="h-8 px-2 rounded-lg border border-outline-variant/60 text-on-surface-variant hover:bg-surface-container hover:text-on-surface disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1 text-xs font-label-sm cursor-pointer"
              disabled={currentPage >= totalPages || loading}
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              <span className="hidden sm:inline">Sau</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ==================== CONTEXTUAL BOTTOM BANNER: AI AUTO RECOGNITION SUMMARY ==================== */}
      <div className="p-4 rounded-xl bg-surface-container border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-body-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-container text-on-primary flex items-center justify-center flex-shrink-0">
            <Bot size={20} aria-hidden="true" />
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
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
