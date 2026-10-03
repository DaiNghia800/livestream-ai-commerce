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
import { formatMoney } from "@/lib/format";
import styles from "./inventory.module.css";

export function InventoryAdjustment() {
  const adjustmentVariants = [
    {
      sku: "A001-WHT-M",
      variant: "Trắng / Size M",
      stock: 50,
      available: 38,
      adjustment: 2,
      reason: "Kiểm kê định kỳ chênh lệch",
      note: "Hàng mẫu trưng bày tại phòng Live",
    },
    {
      sku: "A001-WHT-L",
      variant: "Trắng / Size L",
      stock: 65,
      available: 50,
      adjustment: -3,
      reason: "Hàng rách/lỗi may",
      note: "Hàng rách đường chỉ sau sản xuất",
    },
    {
      sku: "A001-BLK-M",
      variant: "Đen / Size M",
      stock: 80,
      available: 62,
      adjustment: 20,
      reason: "Nhập hàng bổ sung",
      note: "Lô hàng may bổ sung từ xưởng",
    },
    {
      sku: "A001-BLK-XL",
      variant: "Đen / Size XL",
      stock: 45,
      available: 35,
      adjustment: 0,
      reason: "Kiểm đếm thực tế",
      note: "Không có biến động",
    },
  ] as const;

  const initialAdjustments = Object.fromEntries(
    adjustmentVariants.map((variant) => [variant.sku, variant.adjustment]),
  );

  function getAdjustmentProductImage() {
    const product = productMockList.find((item) => item.id === "AO01");
    if (!product) {
      throw new Error("Missing product image for inventory adjustment product AO01.");
    }
    return product.imageUrl;
  }

  const [adjustments, setAdjustments] =
    useState<Record<string, number>>(initialAdjustments);
  const [adjustmentNotice, setAdjustmentNotice] = useState("");
  const [notifyLive, setNotifyLive] = useState(true);
  const adjustmentTotal = adjustmentVariants.reduce(
    (total, variant) => total + (adjustments[variant.sku] ?? 0),
    0,
  );

    function resetAdjustments() {
      setAdjustments(initialAdjustments);
      setAdjustmentNotice("Đã khôi phục số liệu điều chỉnh ban đầu.");
    }

    return (
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
                  alt="Áo Sơ Mi Linen Cổ Tàu Cao Cấp"
                  className={styles.adjustmentProductImage}
                  height={62}
                  src={getAdjustmentProductImage()}
                  unoptimized
                  width={62}
                />
                <div className={styles.selectedProductCopy}>
                  <div className={styles.productBadges}>
                    <span className={styles.editingBadge}>SẢN PHẨM ĐANG ĐIỀU CHỈNH</span>
                    <span className={styles.locationBadge}>Vị trí: Kệ A1-04-HN</span>
                  </div>
                  <strong>Áo Sơ Mi Linen Cổ Tàu Cao Cấp</strong>
                  <span>Mã SKU cha: LINEN-CUS-25 · Mã chốt đơn Live: <b>#A001</b></span>
                  <span>Nhóm hàng: <b>Thời trang Nam / Áo sơ mi</b></span>
                  <span className={styles.productDescription}>
                    Chất liệu linen tự nhiên, form suông rộng, may chỉ cổ cao cấp, hàng chính hãng...
                  </span>
                </div>
                <strong className={styles.adjustmentPrice}>289.000 đ</strong>
              </div>
              <div className={styles.wmsCallout}>
                <CircleCheck size={15} aria-hidden="true" />
                <p>
                  <strong>Cảnh báo quy tắc nghiệp vụ WMS:</strong> Số lượng giảm tồn
                  không được vượt quá số lượng Tồn khả dụng (265 cái) để bảo đảm
                  hàng đang ghi nhớ cho Livestream không bị thiếu hụt hoặc hủy tự động.
                </p>
              </div>
            </article>

            <div className={styles.adjustmentMetrics} aria-label="Tổng quan tồn kho">
              <article className={styles.adjustmentMetric}>
                <div>
                  <span>TỔNG TỒN HỆ THỐNG</span>
                  <strong>350</strong>
                  <small>Bao gồm 4 biến thể</small>
                </div>
                <span className={styles.metricIcon}><ClipboardList size={15} aria-hidden="true" /></span>
              </article>
              <article className={`${styles.adjustmentMetric} ${styles.liveMetric}`}>
                <div>
                  <span>ĐANG GIỮ CHỖ LIVE</span>
                  <strong>85</strong>
                  <small>Reserved 12 giờ pending</small>
                </div>
                <span className={styles.metricIcon}><LockKeyhole size={15} aria-hidden="true" /></span>
              </article>
              <article className={`${styles.adjustmentMetric} ${styles.availableMetric}`}>
                <div>
                  <span>TỒN KHẢ DỤNG (AVAILABLE)</span>
                  <strong>265</strong>
                  <small>Sẵn sàng chiến lược ngay</small>
                </div>
                <span className={styles.metricIcon}><PackageCheck size={15} aria-hidden="true" /></span>
              </article>
              <article className={`${styles.adjustmentMetric} ${styles.thresholdMetric}`}>
                <div>
                  <span>NGƯỠNG TỐI THIỂU</span>
                  <strong>15</strong>
                  <small>Cảnh báo restock xưởng</small>
                </div>
                <span className={styles.metricIcon}><AlertTriangle size={15} aria-hidden="true" /></span>
              </article>
            </div>
          </section>

          <section className={styles.variantsCard} aria-labelledby="variants-title">
            <header className={styles.variantsHeader}>
              <div>
                <h2 id="variants-title">
                  Bảng phân bổ điều chỉnh chi tiết theo từng biến thể (SKU Variants)
                </h2>
                <p>
                  Tự động tính toán số lượng chênh lệch thực tế, cập nhật lại dữ liệu
                  tồn kho WMS và bật chốt đơn
                </p>
              </div>
              <div className={styles.variantsActions}>
                <span className={styles.variantCount}>4 Biến thể SKU</span>
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
                          <select aria-label={`Loại điều chỉnh ${variant.sku}`} defaultValue="count">
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
                          <select aria-label={`Lý do điều chỉnh ${variant.sku}`} defaultValue={variant.reason}>
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
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer className={styles.adjustmentTableFooter}>
              <span>Tổng cộng: 4 biến thể được quét</span>
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
              <span>Giá trị biến động tồn: <strong className={styles.impactValue}>{formatMoney(adjustmentTotal * 289_000)}</strong></span>
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
                  <small>Bật chốt đơn sẽ lập tức mở thêm quota cho biến thể A001-BLK-M và A001-WHT-M cho khách đang xem live</small>
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
                onClick={() => setAdjustmentNotice("Đã xác nhận và cập nhật tồn kho khả dụng.")}
                type="button"
              >
                <CircleCheck size={14} aria-hidden="true" />
                Xác nhận &amp; Cập nhật tồn kho khả dụng ngay
              </button>
            </footer>
          </section>
        </section>
    );
}
