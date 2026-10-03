"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Bolt,
  Check,
  CircleCheck,
  CircleMinus,
  CirclePlus,
  ClipboardList,
  Clock3,
  ImagePlus,
  LockKeyhole,
  PackageCheck,
  Printer,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Warehouse,
  X,
} from "lucide-react";
import { productMockList } from "@/mocks/product";
import type { ProductItem } from "@/features/product/types";
import { formatMoney } from "@/lib/format";
import { Dialog } from "@/components/ui/dialog";
import styles from "./inventory.module.css";

type AdjustmentVariant = {
  sku: string;
  variant: string;
  stock: number;
  available: number;
  adjustment: number;
  reason: string;
  note: string;
};

const ao01AdjustmentVariants: AdjustmentVariant[] = [
    { sku: "A001-WHT-M", variant: "Trắng / Size M", stock: 85, available: 65, adjustment: 2, reason: "Kiểm kê định kỳ chênh lệch", note: "Hàng mẫu trưng bày tại phòng Live" },
    { sku: "A001-WHT-L", variant: "Trắng / Size L", stock: 95, available: 72, adjustment: -3, reason: "Hàng rách/lỗi may", note: "Hàng rách đường chỉ sau sản xuất" },
    { sku: "A001-BLK-M", variant: "Đen / Size M", stock: 100, available: 75, adjustment: 20, reason: "Nhập hàng bổ sung", note: "Lô hàng may bổ sung từ xưởng" },
    { sku: "A001-BLK-XL", variant: "Đen / Size XL", stock: 70, available: 53, adjustment: 0, reason: "Kiểm đếm thực tế", note: "Không có biến động" },
];

function getAdjustmentVariants(product: ProductItem): AdjustmentVariant[] {
  if (product.id === "AO01") return ao01AdjustmentVariants;
  return [{
    sku: product.sku,
    variant: `Tồn tổng hợp · ${product.variantDetails}`,
    stock: product.availableStock + product.reservedStock,
    available: product.availableStock,
    adjustment: 0,
    reason: "Kiểm đếm thực tế",
    note: "Số liệu tổng hợp từ danh mục sản phẩm",
  }];
}

export function InventoryAdjustment() {
  const [selectedProductId, setSelectedProductId] = useState("AO01");
  const [adjustments, setAdjustments] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      ao01AdjustmentVariants.map((variant) => [
        variant.sku,
        variant.adjustment,
      ]),
    ),
  );
  const [adjustmentNotice, setAdjustmentNotice] = useState("");
  const [notifyLive, setNotifyLive] = useState(true);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const selectedProduct = productMockList.find(
    (product) => product.id === selectedProductId,
  );
  if (!selectedProduct) {
    throw new Error(`Missing inventory adjustment product "${selectedProductId}".`);
  }
  const adjustmentVariants = getAdjustmentVariants(selectedProduct);
  const totalStock = adjustmentVariants.reduce((sum, variant) => sum + variant.stock, 0);
  const availableStock = adjustmentVariants.reduce(
    (sum, variant) => sum + variant.available,
    0,
  );
  const reservedStock = totalStock - availableStock;
  const adjustmentTotal = adjustmentVariants.reduce(
    (total, variant) => total + (adjustments[variant.sku] ?? 0),
    0,
  );

  function resetAdjustments() {
    setAdjustments(
      Object.fromEntries(
        adjustmentVariants.map((variant) => [
          variant.sku,
          variant.adjustment,
        ]),
      ),
    );
    setAdjustmentNotice("Đã khôi phục số liệu điều chỉnh ban đầu.");
  }

  function selectProduct(productId: string) {
    const product = productMockList.find((item) => item.id === productId);
    if (!product) {
      throw new Error(`Missing inventory adjustment product "${productId}".`);
    }
    const variants = getAdjustmentVariants(product);
    setSelectedProductId(productId);
    setAdjustments(
      Object.fromEntries(variants.map((variant) => [variant.sku, variant.adjustment])),
    );
    setIsProductPickerOpen(false);
    setAdjustmentNotice("Đã đổi sản phẩm và cập nhật dữ liệu biến thể tương ứng.");
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
              <Link
                className={styles.cancelButton}
                href="/shop/inventory"
              >
                <X size={14} aria-hidden="true" />
                Hủy bỏ
              </Link>
              <button
                className={styles.adjustmentPrimaryButton}
                onClick={() => setAdjustmentNotice("Đã lưu phiếu điều chỉnh tồn kho ADJ-2025-0842.")}
                type="button"
              >
                <Save size={14} aria-hidden="true" />
                Lưu phiếu điều chỉnh
              </button>
            </div>
          </header>

          {adjustmentNotice && (
            <p className={styles.adjustmentNotice} role="status">
              <Check size={14} aria-hidden="true" />
              {adjustmentNotice}
              <button
                aria-label="Đóng thông báo điều chỉnh"
                onClick={() => setAdjustmentNotice("")}
                type="button"
              >
                ×
              </button>
            </p>
          )}

          <section className={styles.adjustmentSummary} aria-label="Tóm tắt điều chỉnh">
            <article className={styles.productAdjustmentCard}>
              <div className={styles.selectedProduct}>
                <Image
                  alt={selectedProduct.name}
                  className={styles.adjustmentProductImage}
                  height={112}
                  src={selectedProduct.imageUrl}
                  unoptimized
                  width={112}
                />
                <div className={styles.selectedProductCopy}>
                  <div className={styles.productBadges}>
                    <span className={styles.editingBadge}>SẢN PHẨM ĐANG ĐIỀU CHỈNH</span>
                    <span className={styles.locationBadge}>
                      Vị trí: {selectedProduct.id === "AO01" ? "Kệ A1-04-HN" : `Kho tổng ${selectedProduct.id}`}
                    </span>
                  </div>
                  <strong>{selectedProduct.name}</strong>
                  <span>Mã SKU cha: {selectedProduct.sku} · Mã chốt đơn Live: <b>#{selectedProduct.id}</b></span>
                  <span>Nhóm hàng: <b>{selectedProduct.category}</b></span>
                  <span
                    className={styles.productDescription}
                    title={selectedProduct.variantDetails}
                  >
                    {selectedProduct.variantDetails}
                  </span>
                </div>
                <div className={styles.selectedProductAside}>
                  <strong className={styles.adjustmentPrice}>
                    {formatMoney(selectedProduct.id === "AO01" ? 289_000 : selectedProduct.livePrice)}
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
                  hàng đang ghi nhớ cho Livestream không bị thiếu hụt hoặc hủy tự động.
                </p>
              </div>
            </article>

            <div className={styles.adjustmentMetrics} aria-label="Tổng quan tồn kho">
              <article className={styles.adjustmentMetric}>
                <div>
                  <span>TỔNG TỒN HỆ THỐNG</span>
                  <strong>{totalStock}</strong>
                  <small>Bao gồm {adjustmentVariants.length} biến thể</small>
                </div>
                <span className={styles.metricIcon}><ClipboardList size={15} aria-hidden="true" /></span>
              </article>
              <article className={`${styles.adjustmentMetric} ${styles.liveMetric}`}>
                <div>
                  <span>ĐANG GIỮ CHỖ LIVE</span>
                  <strong>{reservedStock}</strong>
                  <small>Đang giữ chỗ trên phiên Live</small>
                </div>
                <span className={styles.metricIcon}><LockKeyhole size={15} aria-hidden="true" /></span>
              </article>
              <article className={`${styles.adjustmentMetric} ${styles.availableMetric}`}>
                <div>
                  <span>TỒN KHẢ DỤNG (AVAILABLE)</span>
                  <strong>{availableStock}</strong>
                  <small>Sẵn sàng chiến lược ngay</small>
                </div>
                <span className={styles.metricIcon}><PackageCheck size={15} aria-hidden="true" /></span>
              </article>
              <article className={`${styles.adjustmentMetric} ${styles.thresholdMetric}`}>
                <div>
                  <span>NGƯỠNG TỐI THIỂU</span>
                  <strong>{Math.min(15, availableStock)}</strong>
                  <small>Cảnh báo restock xưởng</small>
                </div>
                <span className={styles.metricIcon}><AlertTriangle size={15} aria-hidden="true" /></span>
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
                  <span className={styles.variantCount}>
                    {adjustmentVariants.length} Biến thể SKU
                  </span>
                </div>
                <p
                  title="Tự động tính toán số lượng chênh lệch thực tế, cập nhật lại dữ liệu tồn kho WMS và bật chốt đơn"
                >
                  Tự động tính toán số lượng chênh lệch thực tế, cập nhật lại dữ liệu
                  tồn kho WMS và bật chốt đơn
                </p>
              </div>
              <div className={styles.variantsActions}>
                <button type="button" onClick={() => setAdjustmentNotice("Bộ lọc chỉ hiển thị các biến thể có thay đổi.")}>
                  <SlidersHorizontal size={12} aria-hidden="true" />
                  Lọc biến thể có thay đổi
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
                    <th>LOẠI ĐIỀU CHỈNH</th>
                    <th>SỐ LƯỢNG ĐỔI</th>
                    <th>TỒN MỚI</th>
                    <th>LÝ DO ĐIỀU CHỈNH</th>
                    <th>GHI CHÚ CHI TIẾT</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustmentVariants.map((variant) => {
                    const adjustment = adjustments[variant.sku] ?? 0;
                    const isPositive = adjustment > 0;
                    const isNegative = adjustment < 0;
                    return (
                      <tr key={variant.sku}>
                        <td>
                          <span className={`${styles.variantStatus} ${isNegative ? styles.negativeStatus : ""}`}>
                            {isNegative ? <CircleMinus size={12} /> : <CirclePlus size={12} />}
                          </span>
                          <strong>{variant.sku}</strong>
                        </td>
                        <td>{variant.variant}</td>
                        <td className={styles.numericValue}>{variant.stock}</td>
                        <td className={`${styles.numericValue} ${styles.availableValue}`}>
                          {variant.available}
                        </td>
                        <td>
                          <select
                            aria-label={`Loại điều chỉnh ${variant.sku}`}
                            defaultValue="count"
                            onChange={(event) => {
                              event.currentTarget.title =
                                event.currentTarget.selectedOptions[0]?.text ?? "";
                            }}
                            title="Kiểm đếm thực tế"
                          >
                            <option value="count">Kiểm đếm thực tế</option>
                            <option value="increase">Tăng tồn (+)</option>
                            <option value="decrease">Giảm tồn (-)</option>
                          </select>
                        </td>
                        <td>
                          <label className="sr-only" htmlFor={`adjustment-${variant.sku}`}>
                            Số lượng điều chỉnh {variant.sku}
                          </label>
                          <input
                            id={`adjustment-${variant.sku}`}
                            className={`${styles.quantityInput} ${isPositive ? styles.positiveInput : ""} ${isNegative ? styles.negativeInput : ""}`}
                            max={variant.available}
                            min={-variant.available}
                            onChange={(event) =>
                              setAdjustments((current) => ({
                                ...current,
                                [variant.sku]: Number(event.target.value),
                              }))
                            }
                            type="number"
                            value={adjustment}
                          />
                        </td>
                        <td>
                          <span className={`${styles.newStock} ${isPositive ? styles.positiveStock : ""}`}>
                            {variant.stock + adjustment}
                          </span>
                        </td>
                        <td>
                          <select
                            aria-label={`Lý do điều chỉnh ${variant.sku}`}
                            defaultValue={variant.reason}
                            onChange={(event) => {
                              event.currentTarget.title =
                                event.currentTarget.selectedOptions[0]?.text ?? "";
                            }}
                            title={variant.reason}
                          >
                            <option>{variant.reason}</option>
                            <option>Kiểm kê định kỳ chênh lệch</option>
                            <option>Hàng rách/lỗi may</option>
                            <option>Nhập hàng bổ sung</option>
                          </select>
                        </td>
                        <td>
                          <input
                            aria-label={`Ghi chú chi tiết ${variant.sku}`}
                            className={styles.noteInput}
                            defaultValue={variant.note}
                            onChange={(event) => {
                              event.currentTarget.title = event.currentTarget.value;
                            }}
                            title={variant.note}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer className={styles.adjustmentTableFooter}>
              <span>Tổng cộng: {adjustmentVariants.length} biến thể được quét</span>
              <span className={styles.footerPositive}>● {adjustmentVariants.filter((row) => (adjustments[row.sku] ?? 0) > 0).length} biến thể tăng tồn</span>
              <span className={styles.footerNegative}>● {adjustmentVariants.filter((row) => (adjustments[row.sku] ?? 0) < 0).length} biến thể giảm tồn</span>
              <span>● {adjustmentVariants.filter((row) => (adjustments[row.sku] ?? 0) === 0).length} biến thể không đổi</span>
              <strong><Bolt size={12} aria-hidden="true" /> LiveOrder AI Audit Engine: Dữ liệu tồn kho WMS đã được đối soát 100%</strong>
            </footer>
          </section>

          <section className={styles.approvalCard} aria-labelledby="approval-title">
            <header className={styles.approvalHeader}>
              <span className={styles.approvalIcon}><ClipboardList size={17} aria-hidden="true" /></span>
              <div>
                <h2 id="approval-title">Thông tin chứng từ &amp; Xác nhận phê duyệt</h2>
                <p>Lưu vết kiểm kê theo quy chuẩn kế toán và kho vận được thực thi với phiên Live đang phát sóng</p>
              </div>
              <span className={styles.documentCode}>Mã phiếu: <b>#ADJ-2025-0842</b></span>
            </header>
            <div className={styles.approvalDetails}>
              <div>
                <span>Người tạo phiếu</span>
                <strong><span className={styles.approverAvatar}>TT</span> Quản trị viên kho (Vận hành Studio 01)</strong>
                <small>tuan.tran@liveorder.ai</small>
              </div>
              <div>
                <span>Thời gian thực hiện</span>
                <strong><Clock3 size={13} aria-hidden="true" /> 20/06/2025 14:30:15 (GMT+7)</strong>
              </div>
              <div>
                <span>Kênh kiểm kê</span>
                <strong><Warehouse size={13} aria-hidden="true" /> Kho tổng Hà Nội &amp; Livestream Studio 1</strong>
              </div>
            </div>
            <div className={styles.impactSummary}>
              <span>Tổng SKU điều chỉnh: <strong>3 biến thể</strong></span>
              <span>Tổng số lượng chênh lệch: <strong className={styles.footerPositive}>{adjustmentTotal >= 0 ? "+" : ""}{adjustmentTotal} sản phẩm</strong></span>
              <span>Giá trị biến động tồn: <strong className={styles.impactValue}>{formatMoney(adjustmentTotal * selectedProduct.livePrice)}</strong></span>
              <span className={styles.readyBadge}><CircleCheck size={13} aria-hidden="true" /> ĐÃ SẴN SÀNG DUYỆT</span>
            </div>
            <footer className={styles.approvalFooter}>
              <label>
                <input
                  checked={notifyLive}
                  onChange={(event) => setNotifyLive(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>Gửi thông báo cập nhật tồn tự động sang phiên Livestream đang chạy</strong>
                  <small>Bật chốt đơn sẽ cập nhật quota cho các biến thể của {selectedProduct.name} đang được khách xem live</small>
                </span>
              </label>
              <button
                className={styles.draftButton}
                onClick={() => setAdjustmentNotice("Đã lưu phiếu điều chỉnh vào bản nháp.")}
                type="button"
              >
                Lưu nháp
              </button>
              <button
                className={styles.adjustmentPrimaryButton}
                onClick={() => setAdjustmentNotice(`Đã xác nhận và cập nhật tồn kho khả dụng cho ${selectedProduct.name}.`)}
                type="button"
              >
                <CircleCheck size={14} aria-hidden="true" />
                <span>
                  Xác nhận &amp; Cập nhật tồn kho khả dụng ngay
                </span>
              </button>
            </footer>
          </section>
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
            {productMockList.map((product) => {
              const productVariants = getAdjustmentVariants(product);
              const productAvailable = productVariants.reduce(
                (sum, variant) => sum + variant.available,
                0,
              );
              const productReserved = productVariants.reduce(
                (sum, variant) => sum + variant.stock - variant.available,
                0,
              );
              return (
                <button
                  aria-pressed={product.id === selectedProduct.id}
                  className={`${styles.productChoice} ${
                    product.id === selectedProduct.id ? styles.productChoiceSelected : ""
                  }`}
                  key={product.id}
                  onClick={() => selectProduct(product.id)}
                  type="button"
                >
                  <Image
                    alt=""
                    className={styles.productChoiceImage}
                    height={56}
                    src={product.imageUrl}
                    unoptimized
                    width={56}
                  />
                  <span className={styles.productChoiceDetails}>
                    <strong>{product.name}</strong>
                    <small>{product.sku} · {product.category}</small>
                    <small>Tồn khả dụng: {productAvailable} · Đang giữ: {productReserved}</small>
                  </span>
                  {product.id === selectedProduct.id && (
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
