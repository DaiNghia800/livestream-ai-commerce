"use client";

/**
 * Popup chọn một địa danh (tỉnh/thành hoặc phường/xã) có ô tìm kiếm.
 *
 * Tách ra file riêng vì ba chỗ cùng cần: form xác nhận của khách
 * vãng lai, form thêm địa chỉ trong sổ, và dialog sửa địa chỉ của
 * shop. Tìm không dấu: khách gõ "nha trang" phải ra "Phường Nha Trang".
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import styles from "./address-picker.module.css";

export interface DiaDanh {
  code: string;
  name: string;
}

export function boDau(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d");
}

export function AddressPicker({
  title,
  items,
  loading,
  error,
  onClose,
  onSelect,
}: {
  title: string;
  items: DiaDanh[];
  loading: boolean;
  error: boolean;
  onClose: () => void;
  onSelect: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = items.filter((item) => boDau(item.name).includes(boDau(query.trim())));

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={<Button variant="secondary" onClick={onClose}>Đóng</Button>}
    >
      <div className={styles.picker}>
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên"
          aria-label="Tìm địa danh"
        />
        {loading ? (
          <p>Đang tải danh sách…</p>
        ) : error ? (
          <p role="alert">Không tải được danh sách. Vui lòng thử lại.</p>
        ) : filtered.length === 0 ? (
          <p>Không tìm thấy địa danh.</p>
        ) : (
          <div className={styles.pickerList}>
            {filtered.map((item) => (
              <button key={item.code} type="button" onClick={() => onSelect(item.code)}>
                {item.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
