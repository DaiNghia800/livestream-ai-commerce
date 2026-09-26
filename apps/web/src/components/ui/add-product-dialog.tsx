"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { ProductItem } from "@/mocks/product";

interface AddProductDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (product: ProductItem) => void;
}

export function AddProductDialog({ open, onClose, onAdd }: AddProductDialogProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("Áo sơ mi");
  const [variants, setVariants] = useState("");
  const [livePrice, setLivePrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [stock, setStock] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;

    const newProduct: ProductItem = {
      id: code.trim().toUpperCase(),
      sku: sku.trim().toUpperCase() || `SP-${code.trim().toUpperCase()}-01`,
      name: name.trim(),
      category,
      variantDetails: `${category} • ${variants.trim() || "Tiêu chuẩn"}`,
      livePrice: Number(livePrice) || 299_000,
      originalPrice: originalPrice ? Number(originalPrice) : undefined,
      availableStock: Number(stock) || 50,
      reservedStock: 0,
      status: Number(stock) > 5 ? "active" : Number(stock) > 0 ? "low_stock" : "out_of_stock",
      isBestSeller: false,
      isPinned: false,
      imageUrl:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuA7Y6Z3s4bhId1O7GnYR7Ayp8LkiLBAybZBWsBv1sWKh7R2P2M6OSKddTRDJk0EFvN3EMxn4sEOmGuuJqWbfaDmDB-n2QKGpNVoDo-1spqye1Jwdd2cpU39zeG5Y7la7Rn343benZf_B2vCi74g33FcVNrECAOMvzv8PGrP2NI2osq9BwRGnJ8LzuGb744Cn15d2jwKFF4PLP9X00_RJj2nNQ7vliaz2MbR83s9dSL54U23AZdAmE_R",
    };

    onAdd(newProduct);
    setName("");
    setCode("");
    setSku("");
    setVariants("");
    setLivePrice("");
    setOriginalPrice("");
    setStock("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Thêm sản phẩm mới vào Livestream">
      <form onSubmit={handleSubmit} style={{ marginTop: "var(--space-3)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          <div style={{ gridColumn: "span 2" }}>
            <Input
              label="Tên sản phẩm"
              placeholder="VD: Áo sơ mi Linen Cổ Tàu Form Rộng…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <Input
            label="Mã chốt đơn Live"
            placeholder="VD: AO01, DM02, JN04…"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <Input
            label="Mã SKU kho"
            placeholder="VD: SP-LINEN-001…"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
          <Select
            label="Danh mục"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="Áo sơ mi">Áo sơ mi</option>
            <option value="Đầm & Váy">Đầm & Váy</option>
            <option value="Quần jean">Quần jean</option>
            <option value="Phụ kiện">Phụ kiện</option>
            <option value="Áo thun">Áo thun</option>
          </Select>
          <Input
            label="Phân loại / Màu sắc"
            placeholder="VD: Trắng, Be, Xanh Pastel"
            value={variants}
            onChange={(e) => setVariants(e.target.value)}
          />
          <Input
            label="Giá bán Live (VNĐ)"
            type="number"
            placeholder="299000"
            value={livePrice}
            onChange={(e) => setLivePrice(e.target.value)}
            required
          />
          <Input
            label="Giá niêm yết (VNĐ)"
            type="number"
            placeholder="420000"
            value={originalPrice}
            onChange={(e) => setOriginalPrice(e.target.value)}
          />
          <div style={{ gridColumn: "span 2" }}>
            <Input
              label="Số lượng tồn kho khả dụng"
              type="number"
              placeholder="100"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              required
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "var(--space-2)",
            marginTop: "var(--space-4)",
          }}
        >
          <Button variant="secondary" type="button" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="primary" type="submit">
            Lưu sản phẩm
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
