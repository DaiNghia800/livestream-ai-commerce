"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Bolt,
  Boxes,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  History,
  PackageCheck,
  PackageOpen,
  RotateCcw,
  Search,
  Settings2,
  ShoppingBasket,
  Store,
} from "lucide-react";
import { formatMoney } from "@/lib/format";
import {
  getInventory,
  exportInventory as exportInventoryFile,
  type InventoryItem,
  type InventoryPage,
} from "./api/inventory";
import { getProductCategories, type ProductCategory } from "@/features/product/api/products";
import styles from "./inventory.module.css";

const numberFormat = new Intl.NumberFormat("vi-VN");
const PAGE_SIZES = [10, 20, 50];

function formatRelativeTime(iso: string | null) {
  if (!iso) return "—";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

function itemName(item: InventoryItem) {
  return item.variantName && item.variantName !== "Default"
    ? `${item.productName} - ${item.variantName}`
    : item.productName;
}

export function InventoryManagement() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<InventoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    getProductCategories(controller.signal)
      .then(setCategories)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = {
      q: debouncedQuery || undefined,
      status: statusFilter === "all" ? undefined : (statusFilter as "low"),
      categoryId: categoryFilter === "all" ? undefined : categoryFilter,
      page,
      pageSize,
    };

    // Retry transient failures and keep the last loaded rows visible on error.
    async function load() {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const result = await getInventory(params, controller.signal);
          setData(result);
          setError("");
          break;
        } catch (reason) {
          if (controller.signal.aborted) return;
          if (attempt >= 2) {
            setError(reason instanceof Error ? reason.message : "Không thể tải tồn kho.");
            break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }
      }
      if (!controller.signal.aborted) setLoading(false);
    }

    void load();
    return () => controller.abort();
  }, [categoryFilter, debouncedQuery, page, pageSize, statusFilter]);

  const rows = data?.data ?? [];
  const summary = data?.summary;
  const total = data?.total ?? 0;
  const filteredTotalHeld = data?.filteredTotalHeld ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstShown = rows.length ? (page - 1) * pageSize + 1 : 0;
  const lastShown = (page - 1) * pageSize + rows.length;
  const pageNumbers = [...new Set([
    1,
    totalPages,
    ...Array.from({ length: 3 }, (_, index) => page + index - 1),
  ])]
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= totalPages)
    .sort((a, b) => a - b);
  function resetFilters() {
    setQuery("");
    setDebouncedQuery("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setPage(1);
  }

  async function exportInventory() {
    try {
      const file = await exportInventoryFile({
        q: debouncedQuery || undefined,
        status: statusFilter === "all" ? undefined : (statusFilter as "low"),
        categoryId: categoryFilter === "all" ? undefined : categoryFilter,
      });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "kiem-ke-ton-kho.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice("Đã xuất file Excel tồn kho (tất cả các trang).");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Không thể xuất dữ liệu tồn kho.");
    }
  }

  const alertCount = (summary?.lowStockCount ?? 0) + (summary?.outOfStockCount ?? 0);

  return (
    <div className={styles.workspace}>
      <section className={styles.pageHeader} aria-labelledby="inventory-title">
        <div className={styles.headingCopy}>
          <div className={styles.titleLine}>
            <h1 id="inventory-title">Quản lý Tồn kho &amp; Giữ chỗ Livestream</h1>
            <span className={styles.autoSync}>
              <span aria-hidden="true" />
              Auto-Sync Live
            </span>
          </div>
          <p>
            Kiểm soát số lượng tồn thực tế, tồn khả dụng và số lượng đang giữ
            chỗ tự động từ các phiên livestream.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.secondaryButton} href="/shop/inventory/history">
            <History size={15} aria-hidden="true" />
            Nhật ký biến động
          </Link>
          <button className={styles.secondaryButton} onClick={() => void exportInventory()} type="button">
            <Download size={15} aria-hidden="true" />
            Xuất file kiểm kê
          </button>
          <Link className={styles.adjustButton} href="/shop/inventory/adjustment">
            <Settings2 size={15} aria-hidden="true" />
            Điều chỉnh tồn kho
          </Link>
        </div>
      </section>

      {notice && (
        <p className={styles.notice} role="status">
          <Check size={15} aria-hidden="true" />
          {notice}
          <button aria-label="Đóng thông báo" onClick={() => setNotice("")} type="button">
            ×
          </button>
        </p>
      )}
      {error && (
        <p className={styles.notice} role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          {error}
        </p>
      )}

      <section className={styles.kpiGrid} aria-label="Tổng quan tồn kho">
        <article className={`${styles.kpiCard} ${styles.totalCard}`}>
          <div className={styles.kpiTop}>
            <div>
              <span className={styles.kpiLabel}>Tổng tồn trong kho</span>
              <div className={styles.kpiValue}>
                {numberFormat.format(summary?.totalOnHand ?? 0)} <small>sản phẩm</small>
              </div>
            </div>
            <span className={`${styles.kpiIcon} ${styles.totalIcon}`}>
              <Boxes size={20} aria-hidden="true" />
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span>{numberFormat.format(summary?.skuCount ?? 0)} SKU đang quản lý</span>
          </div>
        </article>

        <article className={`${styles.kpiCard} ${styles.reservedCard}`}>
          <div className={styles.kpiTop}>
            <div>
              <div className={styles.labelWithTag}>
                <span className={styles.kpiLabel} title="Đang giữ chỗ Live">
                  Đang giữ chỗ Live
                </span>
                <span className={styles.miniTag}>RESERVED</span>
              </div>
              <div className={styles.kpiValue}>
                {numberFormat.format(summary?.totalHeld ?? 0)} <small>sản phẩm</small>
              </div>
            </div>
            <span className={`${styles.kpiIcon} ${styles.reservedIcon}`}>
              <ShoppingBasket size={20} aria-hidden="true" />
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.reservedText} title="Tự động khóa bởi AI chốt đơn">
              <Bolt size={14} aria-hidden="true" />
              <span>Tự động khóa bởi AI chốt đơn</span>
            </span>
          </div>
        </article>

        <article className={`${styles.kpiCard} ${styles.availableCard}`}>
          <div className={styles.kpiTop}>
            <div>
              <div className={styles.labelWithTag}>
                <span className={styles.kpiLabel} title="Tồn khả dụng">
                  Tồn khả dụng
                </span>
                <span className={`${styles.miniTag} ${styles.availableTag}`}>AVAILABLE</span>
              </div>
              <div className={styles.kpiValue}>
                {numberFormat.format(summary?.totalAvailable ?? 0)} <small>sản phẩm</small>
              </div>
            </div>
            <span className={`${styles.kpiIcon} ${styles.availableIcon}`}>
              <PackageCheck size={20} aria-hidden="true" />
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.availableText} title="Sẵn sàng bán trên Live & Web">
              <Store size={14} aria-hidden="true" />
              <span>Sẵn sàng bán trên Live &amp; Web</span>
            </span>
          </div>
        </article>

        <article className={`${styles.kpiCard} ${styles.alertCard}`}>
          <div className={styles.kpiTop}>
            <div>
              <div className={styles.labelWithTag}>
                <span className={styles.kpiLabel} title="Cảnh báo sắp hết hàng">
                  Cảnh báo sắp hết hàng
                </span>
                <span className={`${styles.miniTag} ${styles.alertTag}`}>ALERT</span>
              </div>
              <div className={styles.kpiValue}>
                {alertCount} <small>SKU báo động</small>
              </div>
            </div>
            <span className={`${styles.kpiIcon} ${styles.alertIcon}`}>
              <AlertTriangle size={20} aria-hidden="true" />
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span title="Tồn khả dụng thấp hơn ngưỡng cảnh báo">
              {summary?.outOfStockCount ?? 0} hết hàng · {summary?.lowStockCount ?? 0} sắp hết
            </span>
            <a
              href="#inventory-table"
              onClick={() => {
                setStatusFilter("low");
                setPage(1);
              }}
            >
              Xem ngay
            </a>
          </div>
        </article>
      </section>

      <section className={styles.filterCard} aria-label="Bộ lọc tồn kho">
        <div className={styles.filterControls}>
          <label className={styles.searchBox}>
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Tìm sản phẩm trong kho</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên, SKU, hoặc mã SKU..."
              title="Tìm theo tên, SKU, hoặc mã SKU..."
              type="search"
              value={query}
            />
          </label>
          <label className={styles.selectBox}>
            <span className="sr-only">Trạng thái tồn</span>
            <select
              aria-label="Trạng thái tồn"
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              value={statusFilter}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="in_stock">Còn hàng (trên ngưỡng)</option>
              <option value="low">Sắp hết hàng</option>
              <option value="out">Hết hàng (0)</option>
              <option value="high_hold">Đang giữ chỗ Live</option>
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>
          <label className={styles.selectBox}>
            <span className="sr-only">Danh mục</span>
            <select
              aria-label="Danh mục"
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setPage(1);
              }}
              value={categoryFilter}
            >
              <option value="all">Tất cả danh mục</option>
              {categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>
          <button className={styles.resetButton} onClick={resetFilters} type="button">
            <RotateCcw size={14} aria-hidden="true" />
            Đặt lại bộ lọc
          </button>
        </div>
        <div className={styles.filterSummary}>
          <span>
            Hiển thị <strong>{rows.length}</strong> trên <strong>{total}</strong> SKU
            {statusFilter === "high_hold" && (
              <>
                {" · "}Đang giữ chỗ <strong>{numberFormat.format(filteredTotalHeld)}</strong> sản phẩm
              </>
            )}
          </span>
        </div>
      </section>

      <section className={styles.tableCard} id="inventory-table">
        <div className={styles.tableWrap}>
          <table className={styles.inventoryTable}>
            <caption className="sr-only">
              Danh sách sản phẩm và số lượng tồn theo SKU
            </caption>
            <thead>
              <tr>
                <th className={styles.productColumn}>Sản phẩm &amp; SKU</th>
                <th className={styles.numberHeading}>Tổng tồn</th>
                <th className={styles.centerHeading}>Đang giữ chỗ Live</th>
                <th className={styles.numberHeading}>Tồn khả dụng</th>
                <th className={styles.numberHeading}>Giá niêm yết</th>
                <th className={styles.centerHeading}>Cảnh báo an toàn</th>
                <th>Cập nhật</th>
                <th className={styles.actionHeading}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOut = row.stockStatus === "out";
                const isLow = row.stockStatus === "low";
                return (
                  <tr
                    className={`${isLow ? styles.lowRow : ""} ${isOut ? styles.outRow : ""}`}
                    key={row.skuId}
                  >
                    <td className={styles.productCell}>
                      <div className={styles.productInfo}>
                        {row.imageUrl ? (
                          <Image
                            alt={itemName(row)}
                            className={`${styles.productImage} ${isOut ? styles.grayscaleImage : ""}`}
                            height={38}
                            loading="lazy"
                            src={row.imageUrl}
                            unoptimized
                            width={38}
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className={styles.productImage}
                            style={{ background: "#e5e7eb", display: "inline-block" }}
                          />
                        )}
                        <div className={styles.productCopy}>
                          <strong className={isOut ? styles.struckName : ""}>
                            {itemName(row)}
                          </strong>
                          <span>
                            <code>{row.skuCode}</code>
                            {row.categoryName && (
                              <>
                                <span aria-hidden="true">•</span>
                                {row.categoryName}
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className={styles.numberCell}>{row.onHandQuantity}</td>
                    <td className={styles.centerCell}>
                      {row.heldQuantity > 0 ? (
                        <span className={styles.reservedBadge}>
                          <span aria-hidden="true" />
                          {row.heldQuantity} đang giữ
                        </span>
                      ) : (
                        <span className={styles.zeroValue}>0</span>
                      )}
                    </td>
                    <td className={styles.numberCell}>
                      <span
                        className={`${styles.availableBadge} ${
                          isLow ? styles.lowBadge : isOut ? styles.outBadge : ""
                        }`}
                      >
                        {row.availableQuantity} cái
                      </span>
                    </td>
                    <td className={styles.priceCell}>
                      <strong>{formatMoney(Number(row.price))}</strong>
                    </td>
                    <td className={styles.centerCell}>
                      <span
                        className={`${styles.safetyBadge} ${
                          isOut
                            ? styles.outSafety
                            : isLow
                              ? styles.lowSafety
                              : styles.safeSafety
                        }`}
                      >
                        <span aria-hidden="true" />
                        {isOut
                          ? "Hết hàng (0)"
                          : isLow
                            ? `Sắp hết (≤${row.lowStockThreshold})`
                            : `An toàn (>${row.lowStockThreshold})`}
                      </span>
                    </td>
                    <td className={styles.updatedCell}>{formatRelativeTime(row.updatedAt)}</td>
                    <td className={styles.actionCell}>
                      <div>
                        <Link
                          aria-label={`Điều chỉnh tồn kho ${itemName(row)}`}
                          href={`/shop/inventory/adjustment?skuId=${row.skuId}`}
                          title="Điều chỉnh tồn kho"
                        >
                          <Edit3 size={15} aria-hidden="true" />
                        </Link>
                        <Link
                          aria-label={`Chỉnh sửa sản phẩm ${itemName(row)}`}
                          href={`/shop/products/${row.productId}/edit?from=inventory`}
                          title="Chỉnh sửa sản phẩm"
                        >
                          <PackageOpen size={15} aria-hidden="true" />
                        </Link>
                        <Link
                          aria-label={`Lịch sử audit log ${itemName(row)}`}
                          href={`/shop/inventory/history?skuId=${row.skuId}`}
                          title="Lịch sử audit log"
                        >
                          <History size={15} aria-hidden="true" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td className={styles.emptyState} colSpan={8}>
                    {data === null
                      ? "Không thể tải dữ liệu tồn kho. Vui lòng thử lại sau."
                      : "Không tìm thấy sản phẩm phù hợp với bộ lọc."}
                  </td>
                </tr>
              )}
              {loading && rows.length === 0 && (
                <tr>
                  <td className={styles.emptyState} colSpan={8}>
                    Đang tải dữ liệu tồn kho...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className={styles.tableFooter}>
          <div>
            <span>
              Hiển thị{" "}
              <strong>
                {firstShown} - {lastShown}
              </strong>{" "}
              trong tổng số <strong>{total} SKU</strong>
            </span>
            <label className={styles.pageSize}>
              Số dòng:
              <select
                aria-label="Số dòng mỗi trang"
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                value={pageSize}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <nav className={styles.pagination} aria-label="Phân trang tồn kho">
            <button
              aria-label="Trang trước"
              className={styles.pageNav}
              disabled={page === 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              <ChevronLeft size={15} aria-hidden="true" />
              <span className={styles.paginationLabel}>Trước</span>
            </button>
            {pageNumbers.map((pageNumber, index) => (
              <span key={pageNumber} className={styles.pageGroup}>
                {index > 0 && pageNumber - pageNumbers[index - 1] > 1 && (
                  <span aria-hidden="true" className={styles.paginationEllipsis}>
                    ...
                  </span>
                )}
                <button
                  aria-current={pageNumber === page ? "page" : undefined}
                  aria-label={`Trang ${pageNumber}`}
                  className={pageNumber === page ? styles.currentPage : styles.pageNumber}
                  disabled={loading}
                  onClick={() => setPage(pageNumber)}
                  type="button"
                >
                  {pageNumber}
                </button>
              </span>
            ))}
            <button
              aria-label="Trang sau"
              className={styles.pageNav}
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              type="button"
            >
              <span className={styles.paginationLabel}>Sau</span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </nav>
        </footer>
      </section>

    </div>
  );
}
