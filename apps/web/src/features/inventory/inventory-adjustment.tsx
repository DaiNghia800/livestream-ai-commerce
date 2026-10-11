"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bolt,
  Check,
  CircleCheck,
  CircleMinus,
  CirclePlus,
  ClipboardList,
  ImagePlus,
  LockKeyhole,
  PackageCheck,
  Printer,
  RotateCcw,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";
import {
  adjustInventoryBatch,
  getInventory,
  type InventoryItem,
} from "./api/inventory";
import styles from "./inventory.module.css";

const REASONS = [
  "Kiểm kê định kỳ chênh lệch",
  "Nhập hàng bổ sung",
  "Hàng rách/lỗi may",
  "Thất thoát / mất hàng",
  "Khách trả hàng",
  "Điều chỉnh khác",
];

type ProductGroup = {
  productId: string;
  productName: string;
  productCode: string;
  categoryName: string | null;
  imageUrl: string | null;
  variants: InventoryItem[];
};

function groupByProduct(items: InventoryItem[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  for (const item of items) {
    const group = groups.get(item.productId) ?? {
      productId: item.productId,
      productName: item.productName,
      productCode: item.productCode,
      categoryName: item.categoryName,
      imageUrl: item.imageUrl,
      variants: [],
    };
    group.imageUrl ??= item.imageUrl;
    group.variants.push(item);
    groups.set(item.productId, group);
  }
  return [...groups.values()];
}

export function InventoryAdjustment({ initialSkuId }: { initialSkuId?: string }) {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getInventory({ page: 1, pageSize: 100 }, controller.signal)
      .then((result) => {
        setItems(result.data);
        setError("");
        setLoading(false);
        setSelectedProductId((current) => {
          if (current && result.data.some((item) => item.productId === current)) return current;
          const initial = result.data.find((item) => item.skuId === initialSkuId);
          return initial?.productId ?? result.data[0]?.productId ?? null;
        });
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Không thể tải tồn kho.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [initialSkuId]);

  const products = useMemo(() => groupByProduct(items), [items]);
  const selectedProduct = products.find((product) => product.productId === selectedProductId);
  const variants = useMemo(() => selectedProduct?.variants ?? [], [selectedProduct]);

  const totalStock = variants.reduce((sum, variant) => sum + variant.onHandQuantity, 0);
  const reservedStock = variants.reduce((sum, variant) => sum + variant.heldQuantity, 0);
  const availableStock = totalStock - reservedStock;
  const minThreshold = variants.length
    ? Math.min(...variants.map((variant) => variant.lowStockThreshold))
    : 0;
  const changed = variants.filter((variant) => (adjustments[variant.skuId] ?? 0) !== 0);
  const adjustmentTotal = variants.reduce(
    (total, variant) => total + (adjustments[variant.skuId] ?? 0),
    0,
  );
  const adjustmentValue = variants.reduce(
    (total, variant) => total + (adjustments[variant.skuId] ?? 0) * Number(variant.price),
    0,
  );
  const visibleVariants = onlyChanged ? changed : variants;
  const invalid = variants.some(
    (variant) => (adjustments[variant.skuId] ?? 0) < -variant.availableQuantity,
  );

  function resetAdjustments() {
    setAdjustments({});
    setNotes({});
    setReasons({});
    setNotice("Đã khôi phục số liệu điều chỉnh ban đầu.");
  }

  function selectProduct(productId: string) {
    setSelectedProductId(productId);
    setAdjustments({});
    setNotes({});
    setReasons({});
    setIsProductPickerOpen(false);
    setNotice("Đã đổi sản phẩm và cập nhật dữ liệu biến thể tương ứng.");
  }

  async function save() {
    if (changed.length === 0) {
      setNotice("Chưa có biến thể nào thay đổi số lượng.");
      return;
    }
    if (invalid) {
      setNotice("Số lượng giảm tồn không được vượt quá tồn khả dụng.");
      return;
    }
    setSaving(true);
    try {
      await adjustInventoryBatch(
        changed.map((variant) => ({
          skuId: variant.skuId,
          delta: adjustments[variant.skuId],
          reason: reasons[variant.skuId] ?? REASONS[0],
          note: notes[variant.skuId]?.trim() || null,
        })),
      );
      router.push("/shop/inventory");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Không thể lưu điều chỉnh tồn kho.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className={styles.adjustmentWorkspace} aria-labelledby="adjustment-title">
        <header className={styles.adjustmentHeader}>
          <div className={styles.adjustmentTitle}>
            <span className={styles.adjustmentTitleIcon} aria-hidden="true">
              <SlidersHorizontal size={18} />
            </span>
            <div>
              <h1 id="adjustment-title">Điều chỉnh Tồn kho &amp; Cân đối WMS</h1>
              <p>
                Cập nhật, bù trừ số lượng thực tế trong kho sau kiểm đếm định kỳ
                hoặc xử lý hàng lỗi/thất thoát.
              </p>
            </div>
          </div>
          <div className={styles.adjustmentHeaderActions}>
            <button
              className={styles.adjustmentSecondaryButton}
              onClick={() => window.print()}
              type="button"
            >
              <Printer size={14} aria-hidden="true" />
              In phiếu kiểm kê
            </button>
            <Link className={styles.cancelButton} href="/shop/inventory">
              <X size={14} aria-hidden="true" />
              Hủy bỏ
            </Link>
            <button
              className={styles.adjustmentPrimaryButton}
              disabled={saving}
              onClick={() => void save()}
              type="button"
            >
              <Save size={14} aria-hidden="true" />
              {saving ? "Đang lưu..." : "Lưu phiếu điều chỉnh"}
            </button>
          </div>
        </header>

        {notice && (
          <p className={styles.adjustmentNotice} role="status">
            <Check size={14} aria-hidden="true" />
            {notice}
            <button aria-label="Đóng thông báo điều chỉnh" onClick={() => setNotice("")} type="button">
              ×
            </button>
          </p>
        )}
        {error && (
          <p className={styles.adjustmentNotice} role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            {error}
          </p>
        )}
        {loading && !selectedProduct && (
          <p className={styles.adjustmentNotice} role="status">
            Đang tải dữ liệu tồn kho...
          </p>
        )}
        {!loading && !error && !selectedProduct && (
          <p className={styles.adjustmentNotice} role="status">
            Chưa có sản phẩm nào để điều chỉnh tồn kho.
          </p>
        )}

        {selectedProduct && (
          <>
            <section className={styles.adjustmentSummary} aria-label="Tóm tắt điều chỉnh">
              <article className={styles.productAdjustmentCard}>
                <div className={styles.selectedProduct}>
                  {selectedProduct.imageUrl ? (
                    <Image
                      alt={selectedProduct.productName}
                      className={styles.adjustmentProductImage}
                      height={112}
                      src={selectedProduct.imageUrl}
                      unoptimized
                      width={112}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={styles.adjustmentProductImage}
                      style={{ background: "#e5e7eb", display: "inline-block" }}
                    />
                  )}
                  <div className={styles.selectedProductCopy}>
                    <div className={styles.productBadges}>
                      <span className={styles.editingBadge}>SẢN PHẨM ĐANG ĐIỀU CHỈNH</span>
                    </div>
                    <strong>{selectedProduct.productName}</strong>
                    <span>Mã sản phẩm: {selectedProduct.productCode}</span>
                    {selectedProduct.categoryName && (
                      <span>
                        Nhóm hàng: <b>{selectedProduct.categoryName}</b>
                      </span>
                    )}
                  </div>
                  <div className={styles.selectedProductAside}>
                    <strong className={styles.adjustmentPrice}>
                      {formatMoney(Number(variants[0]?.price ?? 0))}
                    </strong>
                    <button
                      className={styles.changeProductButton}
                      onClick={() => setIsProductPickerOpen(true)}
                      type="button"
                    >
                      <ImagePlus size={14} aria-hidden="true" />
                      Đổi sản phẩm khác
                    </button>
                  </div>
                </div>
                <div className={styles.wmsCallout}>
                  <CircleCheck size={15} aria-hidden="true" />
                  <p>
                    <strong>Cảnh báo quy tắc nghiệp vụ WMS:</strong> Số lượng giảm tồn
                    không được vượt quá số lượng Tồn khả dụng ({availableStock} cái) để bảo đảm
                    hàng đang giữ chỗ cho Livestream không bị thiếu hụt hoặc hủy tự động.
                  </p>
                </div>
              </article>

              <div className={styles.adjustmentMetrics} aria-label="Tổng quan tồn kho">
                <article className={styles.adjustmentMetric}>
                  <div>
                    <span>TỔNG TỒN HỆ THỐNG</span>
                    <strong>{totalStock}</strong>
                    <small>Bao gồm {variants.length} biến thể</small>
                  </div>
                  <span className={styles.metricIcon}>
                    <ClipboardList size={15} aria-hidden="true" />
                  </span>
                </article>
                <article className={`${styles.adjustmentMetric} ${styles.liveMetric}`}>
                  <div>
                    <span>ĐANG GIỮ CHỖ LIVE</span>
                    <strong>{reservedStock}</strong>
                    <small>Đang giữ chỗ trên phiên Live</small>
                  </div>
                  <span className={styles.metricIcon}>
                    <LockKeyhole size={15} aria-hidden="true" />
                  </span>
                </article>
                <article className={`${styles.adjustmentMetric} ${styles.availableMetric}`}>
                  <div>
                    <span>TỒN KHẢ DỤNG (AVAILABLE)</span>
                    <strong>{availableStock}</strong>
                    <small>Sẵn sàng bán ngay</small>
                  </div>
                  <span className={styles.metricIcon}>
                    <PackageCheck size={15} aria-hidden="true" />
                  </span>
                </article>
                <article className={`${styles.adjustmentMetric} ${styles.thresholdMetric}`}>
                  <div>
                    <span>NGƯỠNG TỐI THIỂU</span>
                    <strong>{minThreshold}</strong>
                    <small>Cảnh báo restock xưởng</small>
                  </div>
                  <span className={styles.metricIcon}>
                    <AlertTriangle size={15} aria-hidden="true" />
                  </span>
                </article>
              </div>
            </section>

            <section className={styles.variantsCard} aria-labelledby="variants-title">
              <header className={styles.variantsHeader}>
                <div className={styles.variantsTitleCopy}>
                  <div className={styles.variantsTitleRow}>
                    <h2 id="variants-title">
                      Bảng phân bổ điều chỉnh chi tiết theo từng biến thể (SKU Variants)
                    </h2>
                    <span className={styles.variantCount}>{variants.length} Biến thể SKU</span>
                  </div>
                  <p>
                    Nhập số lượng thay đổi (dương để tăng, âm để giảm); hệ thống ghi nhật ký
                    biến động cho từng SKU.
                  </p>
                </div>
                <div className={styles.variantsActions}>
                  <button type="button" onClick={() => setOnlyChanged((value) => !value)}>
                    <SlidersHorizontal size={12} aria-hidden="true" />
                    {onlyChanged ? "Hiển thị tất cả biến thể" : "Lọc biến thể có thay đổi"}
                  </button>
                  <button type="button" onClick={resetAdjustments}>
                    <RotateCcw size={12} aria-hidden="true" />
                    Đặt lại mặc định
                  </button>
                </div>
              </header>
              <div className={styles.adjustmentTableWrap}>
                <table className={styles.adjustmentTable}>
                  <caption className="sr-only">
                    Điều chỉnh số lượng tồn kho của từng biến thể sản phẩm.
                  </caption>
                  <thead>
                    <tr>
                      <th>SKU BIẾN THỂ</th>
                      <th>BIẾN THỂ (MÀU / SIZE)</th>
                      <th>TỒN HỆ THỐNG</th>
                      <th>KHẢ DỤNG</th>
                      <th>SỐ LƯỢNG ĐỔI</th>
                      <th>TỒN MỚI</th>
                      <th>LÝ DO ĐIỀU CHỈNH</th>
                      <th>GHI CHÚ CHI TIẾT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleVariants.map((variant) => {
                      const adjustment = adjustments[variant.skuId] ?? 0;
                      const isPositive = adjustment > 0;
                      const isNegative = adjustment < 0;
                      return (
                        <tr key={variant.skuId}>
                          <td>
                            <span
                              className={`${styles.variantStatus} ${isNegative ? styles.negativeStatus : ""}`}
                            >
                              {isNegative ? <CircleMinus size={12} /> : <CirclePlus size={12} />}
                            </span>
                            <strong>{variant.skuCode}</strong>
                          </td>
                          <td>{variant.variantName}</td>
                          <td className={styles.numericValue}>{variant.onHandQuantity}</td>
                          <td className={`${styles.numericValue} ${styles.availableValue}`}>
                            {variant.availableQuantity}
                          </td>
                          <td>
                            <label className="sr-only" htmlFor={`adjustment-${variant.skuId}`}>
                              Số lượng điều chỉnh {variant.skuCode}
                            </label>
                            <input
                              id={`adjustment-${variant.skuId}`}
                              className={`${styles.quantityInput} ${isPositive ? styles.positiveInput : ""} ${isNegative ? styles.negativeInput : ""}`}
                              min={-variant.availableQuantity}
                              onChange={(event) =>
                                setAdjustments((current) => ({
                                  ...current,
                                  [variant.skuId]: Math.trunc(Number(event.target.value) || 0),
                                }))
                              }
                              type="number"
                              value={adjustment}
                            />
                          </td>
                          <td>
                            <span
                              className={`${styles.newStock} ${isPositive ? styles.positiveStock : ""}`}
                            >
                              {variant.onHandQuantity + adjustment}
                            </span>
                          </td>
                          <td>
                            <select
                              aria-label={`Lý do điều chỉnh ${variant.skuCode}`}
                              onChange={(event) =>
                                setReasons((current) => ({
                                  ...current,
                                  [variant.skuId]: event.target.value,
                                }))
                              }
                              value={reasons[variant.skuId] ?? REASONS[0]}
                            >
                              {REASONS.map((reason) => (
                                <option key={reason}>{reason}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              aria-label={`Ghi chú chi tiết ${variant.skuCode}`}
                              className={styles.noteInput}
                              maxLength={1000}
                              onChange={(event) =>
                                setNotes((current) => ({
                                  ...current,
                                  [variant.skuId]: event.target.value,
                                }))
                              }
                              value={notes[variant.skuId] ?? ""}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <footer className={styles.adjustmentTableFooter}>
                <span>Tổng cộng: {variants.length} biến thể được quét</span>
                <span className={styles.footerPositive}>
                  ● {variants.filter((row) => (adjustments[row.skuId] ?? 0) > 0).length} biến thể tăng tồn
                </span>
                <span className={styles.footerNegative}>
                  ● {variants.filter((row) => (adjustments[row.skuId] ?? 0) < 0).length} biến thể giảm tồn
                </span>
                <span>
                  ● {variants.filter((row) => (adjustments[row.skuId] ?? 0) === 0).length} biến thể không đổi
                </span>
                <strong>
                  <Bolt size={12} aria-hidden="true" /> Mọi thay đổi được ghi vào nhật ký biến động kho
                </strong>
              </footer>
            </section>

            <section className={styles.approvalCard} aria-labelledby="approval-title">
              <header className={styles.approvalHeader}>
                <span className={styles.approvalIcon}>
                  <ClipboardList size={17} aria-hidden="true" />
                </span>
                <div>
                  <h2 id="approval-title">Tóm tắt phiếu điều chỉnh</h2>
                  <p>Xem lại tác động trước khi cập nhật tồn kho khả dụng.</p>
                </div>
              </header>
              <div className={styles.impactSummary}>
                <span>
                  Tổng SKU điều chỉnh: <strong>{changed.length} biến thể</strong>
                </span>
                <span>
                  Tổng số lượng chênh lệch:{" "}
                  <strong className={styles.footerPositive}>
                    {adjustmentTotal >= 0 ? "+" : ""}
                    {adjustmentTotal} sản phẩm
                  </strong>
                </span>
                <span>
                  Giá trị biến động tồn:{" "}
                  <strong className={styles.impactValue}>{formatMoney(adjustmentValue)}</strong>
                </span>
                {invalid ? (
                  <span className={styles.readyBadge}>
                    <AlertTriangle size={13} aria-hidden="true" /> VƯỢT TỒN KHẢ DỤNG
                  </span>
                ) : (
                  <span className={styles.readyBadge}>
                    <CircleCheck size={13} aria-hidden="true" /> ĐÃ SẴN SÀNG DUYỆT
                  </span>
                )}
              </div>
              <footer className={styles.approvalFooter}>
                <button
                  className={styles.adjustmentPrimaryButton}
                  disabled={saving}
                  onClick={() => void save()}
                  type="button"
                >
                  <CircleCheck size={14} aria-hidden="true" />
                  <span>Xác nhận &amp; Cập nhật tồn kho khả dụng ngay</span>
                </button>
              </footer>
            </section>
          </>
        )}
      </section>
      <Dialog
        open={isProductPickerOpen}
        onClose={() => setIsProductPickerOpen(false)}
        title="Chọn sản phẩm điều chỉnh tồn kho"
        size="lg"
      >
        <p className={styles.productPickerHint}>
          Chọn sản phẩm để tải thông tin tồn kho và danh sách biến thể tương ứng.
        </p>
        <div className={styles.productPickerList}>
          {products.map((product) => {
            const available = product.variants.reduce(
              (sum, variant) => sum + variant.availableQuantity,
              0,
            );
            const reserved = product.variants.reduce(
              (sum, variant) => sum + variant.heldQuantity,
              0,
            );
            const isCurrent = product.productId === selectedProductId;
            return (
              <button
                aria-pressed={isCurrent}
                className={`${styles.productChoice} ${isCurrent ? styles.productChoiceSelected : ""}`}
                key={product.productId}
                onClick={() => selectProduct(product.productId)}
                type="button"
              >
                {product.imageUrl ? (
                  <Image
                    alt=""
                    className={styles.productChoiceImage}
                    height={56}
                    src={product.imageUrl}
                    unoptimized
                    width={56}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className={styles.productChoiceImage}
                    style={{ background: "#e5e7eb", display: "inline-block" }}
                  />
                )}
                <span className={styles.productChoiceDetails}>
                  <strong>{product.productName}</strong>
                  <small>
                    {product.productCode}
                    {product.categoryName ? ` · ${product.categoryName}` : ""}
                  </small>
                  <small>
                    Tồn khả dụng: {available} · Đang giữ: {reserved}
                  </small>
                </span>
                {isCurrent && (
                  <span className={styles.productChoiceCurrent}>
                    <Check size={14} aria-hidden="true" />
                    Đang chọn
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Dialog>
    </>
  );
}
