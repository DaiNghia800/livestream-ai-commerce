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
import { getInventory } from "../inventory/api/inventory";
import type { InventorySummary } from "../inventory/api/inventory";

export function MerchantProduct() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [summary, setSummary] = useState<CatalogProductSummary>({
    totalProducts: 0,
    activeProducts: 0,
    skuCount: 0,
    inactiveProducts: 0,
    updatedThisWeekCount: 0,
  });
  const [inventorySummary, setInventorySummary] = useState<InventorySummary | null>(null);
  const [inventoryError, setInventoryError] = useState("");
  const [totalProducts, setTotalProducts] = useState(0);
  const [loadedQuery, setLoadedQuery] = useState("");
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [showImportGuidelines, setShowImportGuidelines] = useState(false);
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

  useEffect(() => {
    const controller = new AbortController();
    getInventory({ page: 1, pageSize: 1 }, controller.signal)
      .then((result) => {
        setInventorySummary(result.summary);
        setInventoryError("");
      })
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setInventoryError(
            requestError instanceof Error ? requestError.message : "Không thể tải tổng quan tồn kho."
          );
        }
      });
    return () => controller.abort();
  }, [refreshKey]);

  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize));
  const firstProduct = totalProducts === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastProduct = Math.min(currentPage * pageSize, totalProducts);

  const handleToggleStatus = async (id: string) => {
    const product = products.find((item) => item.id === id);
    if (!product) return;
    if (product.status !== "active" && product.availableStock === 0) {
      setError("Sản phẩm đã hết tồn khả dụng. Hãy bổ sung tồn kho trước khi kích hoạt lại.");
      return;
    }
    try {
      await updateProductStatus(
        id,
        product.status === "active" ? "discontinued" : "active"
      );
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
      const file = await exportProducts({});
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
    <div className={styles.productWorkspace}>
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
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            className="h-10 whitespace-nowrap px-3.5 rounded-lg border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-high text-label-md font-label-md text-on-surface-variant font-medium inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            type="button"
            disabled={isExporting}
            onClick={handleExport}
          >
            <Download size={18} aria-hidden="true" />
            <span>{isExporting ? "Đang xuất..." : "Xuất danh sách"}</span>
          </button>
          <button
            className="h-10 whitespace-nowrap px-3.5 rounded-lg border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-high text-label-md font-label-md text-on-surface-variant font-medium inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            type="button"
            disabled={isImporting}
            onClick={() => setShowImportGuidelines(true)}
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
          {showImportGuidelines && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setShowImportGuidelines(false);
              }}
            >
              <section
                aria-labelledby="import-guidelines-title"
                aria-modal="true"
                className="w-full max-w-lg rounded-xl bg-surface-container-lowest p-6 shadow-2xl"
                role="dialog"
              >
                <h2 id="import-guidelines-title" className="m-0 text-title-lg font-semibold text-on-surface">
                  Quy định file nhập sản phẩm
                </h2>
                <div className="mt-4 space-y-3 text-body-sm text-on-surface-variant">
                  <p>Chỉ chọn file Excel định dạng <strong>.xlsx</strong>. Mỗi dòng tương ứng với một SKU; các dòng cùng sản phẩm phải có cùng mã, tên, danh mục và trạng thái.</p>
                  <p>Các cột bắt buộc: <strong>Mã chốt đơn chính, Tên sản phẩm, Mã SKU, Phân loại, Giá Flash Live (VND)</strong>.</p>
                  <p>Mã SKU phải duy nhất. Giá phải là số không âm (ví dụ: <strong>400000</strong>). Trạng thái được để trống hoặc chọn <strong>Đang bán, Đã lưu trữ, Ngừng bán</strong>.</p>
                  <p>Các cột Mô tả, Mã danh mục và Đường dẫn hình ảnh là tùy chọn. Nếu nhập mã danh mục, mã đó phải tồn tại.</p>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    className="h-10 rounded-lg border border-outline-variant px-4 text-label-md font-medium text-on-surface-variant hover:bg-surface-container-high"
                    type="button"
                    onClick={() => setShowImportGuidelines(false)}
                  >
                    Hủy
                  </button>
                  <button
                    className="h-10 rounded-lg bg-primary-container px-4 text-label-md font-semibold text-on-primary shadow-sm hover:bg-primary"
                    type="button"
                    onClick={() => {
                      setShowImportGuidelines(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    OK, chọn file
                  </button>
                </div>
              </section>
            </div>
          )}
          <Link
            role="button"
            href="/shop/products/new"
            className="h-10 whitespace-nowrap px-4 rounded-lg bg-primary-container hover:bg-primary text-on-primary text-label-md font-headline-md font-semibold inline-flex items-center gap-2 shadow-sm transition-transform active:scale-[0.98] border-none cursor-pointer hover:no-underline"
          >
            <Plus size={18} aria-hidden="true" />
            <span>Thêm sản phẩm mới</span>
          </Link>
        </div>
      </div>

      {/* ==================== 4 KPI HEADER CARDS (Bento Grid Style) ==================== */}
      <ProductKpiCards kpi={summary} inventorySummary={inventorySummary} />

      {inventoryError && (
        <div role="alert" className="rounded-lg border border-error/30 bg-error-container/30 px-4 py-3 text-sm text-error">
          {inventoryError}
        </div>
      )}
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
      <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/60 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Search Multi-Criteria */}
        <div className="relative w-full md:w-80">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none"
            aria-hidden="true"
          />
          <input
            className={`${styles.filterSearchInput} w-full bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm font-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all`}
            placeholder="Tìm theo Tên SP, SKU, Mã chốt đơn (VD: AO01, SP-LINEN)..."
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        {/* Filters Row */}
        <div className="flex w-full md:w-auto flex-wrap items-center gap-2.5">
          {/* Category Filter */}
          <div className="relative min-w-[150px] flex-1 md:flex-none">
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
          <div className="relative min-w-[140px] flex-1 md:flex-none">
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
              <option value="discontinued">Ngừng bán</option>
            </select>
            <ChevronDown
              size={18}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none"
              aria-hidden="true"
            />
          </div>
          <div className="hidden xl:flex items-center gap-1.5 border-l border-outline-variant/60 pl-2">
            <button
              className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-1.5 text-label-sm font-label-sm font-medium text-primary transition-colors hover:bg-surface-container"
              type="button"
            >
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                star
              </span>
              <span>Best Seller</span>
            </button>
            <button
              className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1.5 text-label-sm font-label-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high"
              type="button"
            >
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
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
          products={products}
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
            {(() => {
              const pageNumbers = new Set([
                1,
                totalPages,
                ...Array.from({ length: 3 }, (_, index) => currentPage + index - 1),
              ]);
              const pages = [...pageNumbers]
                .filter((page) => page >= 1 && page <= totalPages)
                .sort((a, b) => a - b);

              return (
                <>
                  {pages.map((page, index) => (
                    <span key={page} className="inline-flex items-center gap-1">
                      {index > 0 && page - pages[index - 1] > 1 && (
                        <span aria-hidden="true" className="w-6 text-center text-outline">
                          ...
                        </span>
                      )}
                      <button
                        aria-current={page === currentPage ? "page" : undefined}
                        aria-label={`Trang ${page}`}
                        className={`w-8 h-8 rounded-lg font-headline-md text-label-sm font-semibold flex items-center justify-center transition-colors ${
                          page === currentPage
                            ? "bg-primary text-on-primary shadow-sm"
                            : "text-on-surface-variant hover:bg-surface-container"
                        }`}
                        disabled={loading}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    </span>
                  ))}
                </>
              );
            })()}
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

    </div>
  );
}
