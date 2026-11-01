"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { formatMoney } from "@/lib/format";
import type { InventoryItem } from "./api/inventory";
import styles from "./inventory-adjustment-print.module.css";

type Props = {
  productName: string;
  productCode: string;
  categoryName: string | null;
  variants: InventoryItem[];
  adjustments: Record<string, number>;
  reasons: Record<string, string>;
  notes: Record<string, string>;
  defaultReason: string;
};

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function PrintableAdjustment({
  productName,
  productCode,
  categoryName,
  variants,
  adjustments,
  reasons,
  notes,
  defaultReason,
}: Props) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return null;

  const totalOnHand = variants.reduce((sum, item) => sum + item.onHandQuantity, 0);
  const totalHeld = variants.reduce((sum, item) => sum + item.heldQuantity, 0);
  const totalDelta = variants.reduce((sum, item) => sum + (adjustments[item.skuId] ?? 0), 0);
  const totalValue = variants.reduce(
    (sum, item) => sum + (adjustments[item.skuId] ?? 0) * Number(item.price),
    0,
  );
  const changedCount = variants.filter((item) => (adjustments[item.skuId] ?? 0) !== 0).length;

  // Portal into <body> so the global print rule can hide the rest of the app.
  return createPortal(
    <div id="print-root" className={styles.root} aria-hidden="true">
      <article className={styles.sheet}>
        <header className={styles.head}>
          <div>
            <p className={styles.brand}>LIVEORDER AI · HỆ THỐNG LIVESTREAM BÁN HÀNG</p>
            <h1 className={styles.title}>Phiếu điều chỉnh tồn kho</h1>
          </div>
          <div className={styles.meta}>
            <p>Ngày in: {new Date().toLocaleString("vi-VN")}</p>
            <p>Số biến thể: {variants.length}</p>
          </div>
        </header>

        <section className={styles.productBox}>
          <p className={styles.wide}>
            <strong>{productName}</strong>
          </p>
          <p>Mã sản phẩm: {productCode}</p>
          {categoryName && <p>Nhóm hàng: {categoryName}</p>}
        </section>

        <section className={styles.metrics}>
          <div>
            <span>TỔNG TỒN HỆ THỐNG</span>
            <strong>{totalOnHand}</strong>
          </div>
          <div>
            <span>ĐANG GIỮ CHỖ LIVE</span>
            <strong>{totalHeld}</strong>
          </div>
          <div>
            <span>TỒN KHẢ DỤNG</span>
            <strong>{totalOnHand - totalHeld}</strong>
          </div>
          <div>
            <span>SỐ BIẾN THỂ ĐIỀU CHỈNH</span>
            <strong>{changedCount}</strong>
          </div>
        </section>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>SKU</th>
              <th>Biến thể</th>
              <th className={styles.num}>Tồn HT</th>
              <th className={styles.num}>Khả dụng</th>
              <th className={styles.num}>SL đổi</th>
              <th className={styles.num}>Tồn mới</th>
              <th>Lý do / Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((item, index) => {
              const delta = adjustments[item.skuId] ?? 0;
              const note = notes[item.skuId]?.trim();
              return (
                <tr key={item.skuId}>
                  <td>{index + 1}</td>
                  <td className={styles.sku}>{item.skuCode}</td>
                  <td>{item.variantName}</td>
                  <td className={styles.num}>{item.onHandQuantity}</td>
                  <td className={styles.num}>{item.availableQuantity}</td>
                  <td className={styles.num}>{delta === 0 ? "0" : signed(delta)}</td>
                  <td className={styles.num}>
                    <strong>{item.onHandQuantity + delta}</strong>
                  </td>
                  <td>
                    {reasons[item.skuId] ?? defaultReason}
                    {note ? ` — ${note}` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <section className={styles.summary}>
          <p>
            Tổng chênh lệch: <strong>{totalDelta > 0 ? "+" : ""}{totalDelta} sản phẩm</strong>
          </p>
          <p>
            Giá trị biến động tồn: <strong>{formatMoney(totalValue)}</strong>
          </p>
        </section>

        <section className={styles.signatures}>
          <div>
            <p>Người lập phiếu</p>
            <small>(Ký, ghi rõ họ tên)</small>
          </div>
          <div>
            <p>Thủ kho</p>
            <small>(Ký, ghi rõ họ tên)</small>
          </div>
          <div>
            <p>Người duyệt</p>
            <small>(Ký, ghi rõ họ tên)</small>
          </div>
        </section>
      </article>
    </div>,
    document.body,
  );
}
