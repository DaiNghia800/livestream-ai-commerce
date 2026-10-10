"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./product.module.css";
import {
  createProduct,
  getProducts,
  getProductCategories,
  ProductApiError,
  uploadProductImage,
  type ProductCategory,
  type ProductSkuInput,
} from "./api/products";

// ===== Types =====
interface VariantRow {
  id: string;
  color: string;
  colorHex: string;
  size: string;
  sku: string;
  aiCode: string;
  stock: number;
  livePrice: number;
}

const INITIAL_VARIANTS: VariantRow[] = [
  { id: "1", color: "Trắng", colorHex: "#ffffff", size: "M", sku: "AO01-WHT-M", aiCode: "AO01TM", stock: 50, livePrice: 299000 },
  { id: "2", color: "Trắng", colorHex: "#ffffff", size: "L", sku: "AO01-WHT-L", aiCode: "AO01TL", stock: 65, livePrice: 299000 },
  { id: "3", color: "Đen", colorHex: "#000000", size: "M", sku: "AO01-BLK-M", aiCode: "AO01DM", stock: 80, livePrice: 299000 },
  { id: "4", color: "Đen", colorHex: "#000000", size: "XL", sku: "AO01-BLK-XL", aiCode: "AO01DXL", stock: 45, livePrice: 299000 },
  { id: "5", color: "Be", colorHex: "#e8dab2", size: "L", sku: "AO01-BEI-L", aiCode: "AO01BL", stock: 110, livePrice: 299000 },
];

// ===== Helper =====
function formatVnd(value: number | string) {
  const num = typeof value === "string" ? parseInt(value.replace(/\D/g, ""), 10) : value;
  if (isNaN(num)) return "";
  return num.toLocaleString("vi-VN");
}

// ===== Sub-components =====

function SectionCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-surface-container-lowest rounded-xl border border-outline-variant p-6 shadow-sm ${className}`}
    >
      {children}
    </section>
  );
}

function SectionHeader({
  icon,
  title,
  right,
}: {
  icon: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between pb-4 mb-5 border-b border-outline-variant/60">
      <div className="flex items-center gap-2.5">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: "20px" }}>
          {icon}
        </span>
        <h2 className="font-title-sm text-title-sm font-semibold text-on-surface">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function FormInput({
  label,
  required,
  right,
  ...props
}: {
  label?: string;
  required?: boolean;
  right?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      {label && (
        <div className="flex justify-between items-center mb-1.5">
          <label className="font-label-md text-label-md font-medium text-on-surface">
            {label} {required && <span className="text-error">*</span>}
          </label>
          {right}
        </div>
      )}
      <input
        className="w-full h-10 px-3.5 text-body-md font-body-md rounded-lg border border-outline-variant bg-surface-container-lowest focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 transition-all text-on-surface"
        {...props}
      />
    </div>
  );
}

// ===== MAIN PAGE =====
export function CreateProductPage() {
  const router = useRouter();

  // Form state
  const [productName, setProductName] = useState("Áo Sơ Mi Linen Cổ Tàu Cao Cấp");
  const [productCode, setProductCode] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("Linen Heritage Vietnam");
  const [description, setDescription] = useState(
    "- Chất liệu: 100% Linen bột cao cấp, thoáng mát, thấm hút mồ hôi tối đa.\n- Phom dáng: Regular-fit tôn dáng, cổ áo tàu 3cm sang trọng hiện đại.\n- Hướng dẫn giặt: Giặt tay hoặc giặt máy chế độ nhẹ, ủi ở nhiệt độ trung bình."
  );
  const [listedPrice, setListedPrice] = useState("450.000");
  const [livePrice, setLivePrice] = useState("299.000");
  const [totalStock, setTotalStock] = useState(350);
  const [stockWarning, setStockWarning] = useState(15);
  const [triggerCode, setTriggerCode] = useState("AO01");
  const [codeCheck, setCodeCheck] = useState<"idle" | "checking" | "available" | "duplicate" | "unknown">("idle");
  const [productStatus, setProductStatus] = useState<"active" | "draft" | "inactive">("active");
  const [variants, setVariants] = useState<VariantRow[]>(INITIAL_VARIANTS);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [images, setImages] = useState<{ file: File; previewUrl: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shipping
  const [weight, setWeight] = useState(280);
  const [dimL, setDimL] = useState(25);
  const [dimW, setDimW] = useState(18);
  const [dimH, setDimH] = useState(4);

  const totalVariantStock = variants.reduce((sum, v) => sum + v.stock, 0);
  const nameLength = productName.length;

  useEffect(() => {
    const controller = new AbortController();
    void getProductCategories(controller.signal)
      .then((loadedCategories) => {
        setCategories(loadedCategories);
        if (loadedCategories.length > 0) setCategory(String(loadedCategories[0].id));
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Không thể tải danh mục sản phẩm.");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const normalizedCode = triggerCode.trim();
    if (!normalizedCode) {
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setCodeCheck("checking");
      void getProducts({ q: normalizedCode, page: 1, pageSize: 20 }, controller.signal)
        .then((result) => {
          const duplicate = result.data.some(
            (product) => product.code.trim().toUpperCase() === normalizedCode.toUpperCase()
          );
          setCodeCheck(duplicate ? "duplicate" : "available");
        })
        .catch(() => {
          if (!controller.signal.aborted) setCodeCheck("unknown");
        });
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [triggerCode]);

  const handleDeleteVariant = (id: string) => {
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  const handleVariantStockChange = (id: string, val: number) => {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, stock: val } : v)));
  };

  const updateVariant = (id: string, patch: Partial<VariantRow>) => {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const handleAddVariant = () => {
    const base = triggerCode.trim() || "SKU";
    const price = parseInt(livePrice.replace(/\D/g, ""), 10) || 0;
    setVariants((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        color: "",
        colorHex: "#ffffff",
        size: "",
        sku: `${base}-${prev.length + 1}`,
        aiCode: "",
        stock: 0,
        livePrice: price,
      },
    ]);
  };

  const handleApplyPrice = () => {
    const price = parseInt(livePrice.replace(/\D/g, ""), 10) || 0;
    setVariants((prev) => prev.map((v) => ({ ...v, livePrice: price })));
  };

  const handleApplyStock = () => {
    const per = variants.length ? Math.floor(totalStock / variants.length) : 0;
    setVariants((prev) => prev.map((v) => ({ ...v, stock: per })));
  };

  const handleImageSelection = (fileList: FileList | null) => {
    if (!fileList) return;
    const selected = Array.from(fileList);
    if (images.length + selected.length > 8) {
      setError("Mỗi sản phẩm có thể có tối đa 8 ảnh.");
      return;
    }
    const invalid = selected.find(
      (file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024
    );
    if (invalid) {
      setError("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP có dung lượng tối đa 5MB.");
      return;
    }
    setError("");
    setImages((current) => [
      ...current,
      ...selected.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async () => {
    setError("");
    if (!productName.trim()) {
      setError("Tên sản phẩm là bắt buộc.");
      return;
    }
    if (!triggerCode.trim()) {
      setError("Mã chốt đơn chính là bắt buộc.");
      return;
    }
    if (codeCheck === "duplicate") {
      setError("Mã chốt đơn đã tồn tại trong database. Vui lòng chọn mã khác.");
      return;
    }
    const codeValue = productCode.trim() || triggerCode.trim();
    if (!variants.length) {
      setError("Cần có ít nhất một biến thể sản phẩm.");
      return;
    }
    const incompleteVariant = variants.findIndex(
      (variant) =>
        !variant.color.trim() ||
        !variant.size.trim() ||
        !variant.sku.trim() ||
        !variant.aiCode.trim()
    );
    if (incompleteVariant >= 0) {
      setError(
        `Biến thể ${incompleteVariant + 1}: màu sắc, size, mã SKU và mã phụ AI không được để trống.`
      );
      return;
    }
    const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    const skuCodes = variants.map((variant) => normalize(variant.sku));
    if (new Set(skuCodes).size !== skuCodes.length) {
      setError("Mã SKU không được để trống hoặc trùng nhau.");
      return;
    }
    const aiCodes = variants.map((variant) => normalize(variant.aiCode));
    if (new Set(aiCodes).size !== aiCodes.length) {
      setError("Mã phụ AI không được để trống hoặc trùng nhau.");
      return;
    }
    const variantNames = variants.map((variant) =>
      [variant.color, variant.size].map(normalize).join("|")
    );
    if (new Set(variantNames).size !== variantNames.length) {
      setError("Không thể có hai biến thể cùng màu sắc và size.");
      return;
    }
    const categoryId = categories.find((item) => String(item.id) === category)?.id ??
      (Number.isSafeInteger(Number(category)) && Number(category) > 0 ? Number(category) : null);

    const skus: ProductSkuInput[] = variants.map((variant) => ({
      skuCode: variant.sku.trim(),
      variantName: [variant.color, variant.size].filter(Boolean).join(" / ") || "Mặc định",
      price: variant.livePrice,
      aiCode: variant.aiCode.trim() || null,
      stock: Math.max(0, Math.floor(variant.stock) || 0),
      status: "active",
    }));

    setSaving(true);
    try {
      const uploadedImages = await Promise.all(
        images.map(async ({ file }, index) => ({
          url: await uploadProductImage(file),
          isPrimary: index === 0,
          sortOrder: index,
        }))
      );
      await createProduct({
        code: codeValue,
        name: productName.trim(),
        categoryId,
        description: description.trim() || null,
        status: productStatus === "active" ? "active" : productStatus === "draft" ? "archived" : "discontinued",
        skus,
        images: uploadedImages,
      });
      router.push("/shop/products");
    } catch (saveError) {
      if (saveError instanceof ProductApiError && saveError.status === 409) {
        setError("Mã sản phẩm hoặc SKU đã tồn tại. Vui lòng kiểm tra lại.");
      } else {
        setError(saveError instanceof Error ? saveError.message : "Không thể lưu sản phẩm.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {error && (
        <div className="mb-5 rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-body-sm text-error" role="alert">
          {error}
        </div>
      )}
      {/* ===== Breadcrumb & Top Action Bar ===== */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-outline-variant mb-8">
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-body-sm font-body-sm text-outline mb-1.5">
            <Link
              href="/shop/products"
              className="hover:text-primary transition-colors flex items-center gap-1 no-underline text-outline"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                inventory_2
              </span>
              <span>Sản phẩm</span>
            </Link>
            <span>/</span>
            <span className="text-on-surface font-semibold">Thêm sản phẩm mới</span>
          </div>
          {/* Title & Subtitle */}
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
            Tạo sản phẩm mới
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Thêm thông tin hàng hóa, SKU và thiết lập mã chốt đơn AI để tự động nhận diện trong
            livestream
          </p>
        </div>
        {/* Action Buttons */}
        <div className="flex items-center gap-3 self-start lg:self-center">
          <button
            className="h-10 px-5 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-label-md text-label-md font-semibold hover:bg-surface-container-low transition-all duration-150 cursor-pointer"
            type="button"
            onClick={() => router.push("/shop/products")}
          >
            Hủy
          </button>
          <button
            className="h-10 px-6 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md font-semibold shadow hover:bg-primary transition-all duration-150 flex items-center gap-2 cursor-pointer"
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              save
            </span>
            <span>{saving ? "Đang lưu..." : "Lưu sản phẩm"}</span>
          </button>
        </div>
      </div>

      {/* ===== 2-COLUMN LAYOUT ===== */}
      <div className="grid grid-cols-12 gap-6">
        {/* ===== LEFT COLUMN (8 cols) ===== */}
        <div className="col-span-12 xl:col-span-8 flex flex-col gap-6">
          {/* 1. Card: Thông tin chung */}
          <SectionCard>
            <SectionHeader icon="info" title="Thông tin chung" />
            <div className="space-y-4">
              {/* Tên sản phẩm */}
              <FormInput
                label="Tên sản phẩm"
                required
                placeholder="Ví dụ: Áo Sơ Mi Linen Cổ Tàu Dài Tay..."
                value={productName}
                maxLength={120}
                onChange={(e) => setProductName(e.target.value)}
                right={
                  <span className="font-label-sm text-label-sm text-outline">
                    {nameLength} / 120 ký tự
                  </span>
                }
              />

              {/* Mã sản phẩm & Danh mục & Thương hiệu */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-label-md text-label-md font-medium text-on-surface mb-1.5">
                    Mã sản phẩm <span className="text-error">*</span>
                  </label>
                  <input
                    className="w-full h-10 px-3.5 text-body-md font-body-md rounded-lg border border-outline-variant bg-surface-container-lowest focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 transition-all text-on-surface"
                    placeholder="Ví dụ: LINEN-01, AO001..."
                    type="text"
                    maxLength={50}
                    value={productCode}
                    onChange={(e) => setProductCode(e.target.value)}
                  />
                  <p className="mt-1 font-body-sm text-body-sm text-outline">
                    Nếu để trống, mã chốt đơn sẽ được dùng làm mã sản phẩm
                  </p>
                </div>
                <div>
                  <label className="block font-label-md text-label-md font-medium text-on-surface mb-1.5">
                    Danh mục hàng hóa
                  </label>
                  <select
                    className="w-full h-10 px-3 text-body-md font-body-md rounded-lg border border-outline-variant bg-surface-container-lowest focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 transition-all text-on-surface cursor-pointer"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Chưa phân loại</option>
                    {categories.map((item) => (
                      <option key={item.id} value={String(item.id)}>{item.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Thương hiệu */}
              <div>
                <label className="block font-label-md text-label-md font-medium text-on-surface mb-1.5">
                  Thương hiệu / Nhãn hiệu
                </label>
                <input
                  className="w-full h-10 px-3.5 text-body-md font-body-md rounded-lg border border-outline-variant bg-surface-container-lowest focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 transition-all text-on-surface"
                  placeholder="Nhập thương hiệu hoặc OEM..."
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                />
              </div>

              {/* Mô tả chi tiết */}
              <div>
                <label className="block font-label-md text-label-md font-medium text-on-surface mb-1.5">
                  Mô tả chi tiết sản phẩm
                </label>
                <div className="border border-outline-variant rounded-lg overflow-hidden focus-within:border-primary-container focus-within:ring-2 focus-within:ring-primary-container/20 transition-all">
                  {/* Mini toolbar */}
                  <div className="bg-surface-container-low px-3 py-1.5 border-b border-outline-variant flex items-center gap-2 text-on-surface-variant">
                    <button
                      className="p-1 hover:bg-surface-container-high rounded transition-colors cursor-pointer"
                      type="button"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                        format_bold
                      </span>
                    </button>
                    <button
                      className="p-1 hover:bg-surface-container-high rounded transition-colors cursor-pointer"
                      type="button"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                        format_italic
                      </span>
                    </button>
                    <button
                      className="p-1 hover:bg-surface-container-high rounded transition-colors cursor-pointer"
                      type="button"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                        format_list_bulleted
                      </span>
                    </button>
                    <span className="w-px h-4 bg-outline-variant" />
                    <button
                      className="p-1 hover:bg-surface-container-high rounded transition-colors cursor-pointer"
                      type="button"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                        image
                      </span>
                    </button>
                    <button
                      className="p-1 hover:bg-surface-container-high rounded transition-colors cursor-pointer"
                      type="button"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                        link
                      </span>
                    </button>
                  </div>
                  <textarea
                    className="w-full p-3.5 text-body-md font-body-md border-none focus:ring-0 bg-surface-container-lowest text-on-surface placeholder:text-outline resize-none outline-none"
                    placeholder="Mô tả chất liệu, phom dáng và bảng size hỗ trợ AI đọc thông tin cho streamer..."
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* 2. Card: Giá bán & Tồn kho */}
          <SectionCard>
            <SectionHeader
              icon="payments"
              title="Giá bán & Tồn kho"
              right={
                <span className="font-label-sm text-label-sm text-secondary bg-secondary-fixed px-2.5 py-1 rounded-full font-semibold">
                  Tự động áp dụng giá Livestream
                </span>
              }
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Giá niêm yết */}
              <div className="bg-surface-container-low/50 p-3.5 rounded-lg border border-outline-variant">
                <label className="block font-label-sm text-label-sm font-medium text-on-surface-variant mb-1">
                  Giá niêm yết (VND)
                </label>
                <div className="relative">
                  <input
                    className="w-full h-10 pr-8 pl-3 font-title-sm text-title-sm font-bold text-on-surface rounded-lg border border-outline-variant bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/20 focus:border-primary-container transition-all"
                    type="text"
                    value={listedPrice}
                    onChange={(e) => setListedPrice(e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label-sm text-label-sm text-outline">
                    ₫
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-outline mt-1">Giá bán lẻ trên web</p>
              </div>

              {/* Giá Flash Live */}
              <div className="bg-primary-fixed/20 p-3.5 rounded-lg border border-primary-fixed-dim">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-label-sm text-label-sm font-bold text-primary">
                    Giá Flash Live (VND) *
                  </label>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary text-on-primary">
                    -34%
                  </span>
                </div>
                <div className="relative">
                  <input
                    className="w-full h-10 pr-8 pl-3 font-title-sm text-title-sm font-bold text-primary rounded-lg border border-primary-container bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/30 transition-all"
                    type="text"
                    value={livePrice}
                    onChange={(e) => setLivePrice(e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label-sm text-label-sm text-primary font-bold">
                    ₫
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-primary-fixed-variant mt-1 font-medium">
                  Giá áp dụng khi khách chốt qua bot
                </p>
              </div>

              {/* Tổng tồn kho nhập */}
              <div className="bg-surface-container-low/50 p-3.5 rounded-lg border border-outline-variant">
                <label className="block font-label-sm text-label-sm font-medium text-on-surface-variant mb-1">
                  Tổng tồn kho nhập
                </label>
                <div className="relative">
                  <input
                    aria-label="Tổng tồn kho nhập"
                    className={`${styles.numberInputWithSuffix} w-full font-title-sm text-title-sm font-bold text-on-surface rounded-lg border border-outline-variant bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/20 transition-all`}
                    type="number"
                    value={totalStock}
                    onChange={(e) => setTotalStock(Number(e.target.value))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label-sm text-label-sm text-outline">
                    Cái
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-outline mt-1">
                  Sẽ phân bổ theo biến thể
                </p>
              </div>

              {/* Ngưỡng cảnh báo */}
              <div className="bg-surface-container-low/50 p-3.5 rounded-lg border border-outline-variant">
                <label className="block font-label-sm text-label-sm font-medium text-on-surface-variant mb-1">
                  Ngưỡng cảnh báo
                </label>
                <div className="relative">
                  <input
                    aria-label="Ngưỡng cảnh báo tồn kho"
                    className={`${styles.numberInputWithSuffix} w-full font-title-sm text-title-sm font-bold text-error rounded-lg border border-outline-variant bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/20 transition-all`}
                    type="number"
                    value={stockWarning}
                    onChange={(e) => setStockWarning(Number(e.target.value))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label-sm text-label-sm text-outline">
                    Cái
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-outline mt-1">
                  Thông báo streamer nhắc chốt
                </p>
              </div>
            </div>
          </SectionCard>

          {/* 3. Card: Thiết lập Mã Chốt Đơn AI */}
          <section className="bg-surface-container-lowest rounded-xl border-2 border-primary-container/30 p-6 shadow-sm relative overflow-hidden">
            {/* Atmospheric glow */}
            <div className="absolute -top-16 -right-16 w-36 h-36 rounded-full bg-secondary-container/10 blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between pb-4 mb-5 border-b border-outline-variant/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center text-on-primary">
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                    smart_toy
                  </span>
                </div>
                <div>
                  <h2 className="font-title-sm text-title-sm font-bold text-on-surface">
                    Thiết lập Mã Chốt Đơn AI (Order Trigger)
                  </h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Bộ não AI nhận diện comment livestream để tự động giữ hàng và tạo đơn
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-label-sm font-label-sm font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                AI Active Scan
              </span>
            </div>

            {/* Trigger Code Input */}
            <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant mb-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <label className="block font-label-md text-label-md font-bold text-on-surface mb-1.5">
                    Mã chốt đơn chính (Keyword Code) <span className="text-error">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 font-label-md font-bold text-primary">#</span>
                    <input
                      aria-label="Mã chốt đơn chính"
                      className={`${styles.triggerCodeInput} w-full font-metric-num text-metric-num text-primary tracking-wider rounded-lg border-2 border-primary-container bg-surface-container-lowest focus:ring-4 focus:ring-primary-container/20 focus:outline-none transition-all`}
                      type="text"
                      value={triggerCode}
                      onChange={(e) => setTriggerCode(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>
                {/* Validation badge */}
                <div className="flex md:flex-col justify-end items-start md:items-end gap-1.5 pt-2 md:pt-0">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-label-md text-label-md font-semibold ${
                    codeCheck === "duplicate"
                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                      : codeCheck === "available"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}>
                    <span
                      className={`material-symbols-outlined ${codeCheck === "duplicate" ? "text-rose-600" : codeCheck === "available" ? "text-emerald-600" : "text-amber-600"}`}
                      style={{
                        fontSize: "16px",
                        fontVariationSettings: "'FILL' 1",
                      }}
                    >
                      {codeCheck === "duplicate" ? "error" : codeCheck === "checking" ? "hourglass_top" : codeCheck === "available" ? "check_circle" : "help"}
                    </span>
                    <span>{codeCheck === "duplicate" ? "Mã đã tồn tại" : codeCheck === "checking" ? "Đang kiểm tra..." : codeCheck === "available" ? "Mã hợp lệ, chưa trùng" : "Chưa kiểm tra mã"}</span>
                  </div>
                  <span className="font-body-sm text-body-sm text-outline">
                    Độ dài lý tưởng: 3-5 ký tự dễ gõ
                  </span>
                </div>
              </div>
            </div>

            {/* AI Parsing Sample Box */}
            <div className="p-4 rounded-xl bg-surface-container-high/40 border border-outline-variant mb-6">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="material-symbols-outlined text-secondary" style={{ fontSize: "16px" }}>
                  psychology
                </span>
                <span className="font-label-md text-label-md font-bold text-on-surface">
                  Mô hình AI tự động phân tích các mẫu cú pháp sau:
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  {
                    num: "1",
                    pattern: `"${triggerCode} [Số lượng]"`,
                    example: `"${triggerCode} 2 cái nha shop"`,
                    result: "➔ SL = 2, Size mặc định M",
                  },
                  {
                    num: "2",
                    pattern: `"Lấy [SL] cái ${triggerCode}"`,
                    example: `"Lấy 1 cái ${triggerCode} kèm freeship"`,
                    result: "➔ Nhận diện hành vi chốt đơn",
                  },
                  {
                    num: "3",
                    pattern: `"${triggerCode} [Size / Màu]"`,
                    example: `"${triggerCode} size L màu Đen 0912xxx"`,
                    result: "➔ Tự map SKU & SĐT khách",
                  },
                ].map((item) => (
                  <div
                    key={item.num}
                    className="bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant flex items-start gap-2"
                  >
                    <span className="px-1.5 py-0.5 rounded bg-surface-container text-primary font-bold font-label-sm text-label-sm mt-0.5 shrink-0">
                      {item.num}
                    </span>
                    <div className="min-w-0">
                      <div className="font-label-md text-label-md font-semibold text-on-surface">
                        {item.pattern}
                      </div>
                      <div className="font-body-sm text-body-sm text-outline">
                        VD:{" "}
                        <span className="text-on-surface-variant font-medium">{item.example}</span>
                      </div>
                      <div className="font-label-sm text-label-sm text-emerald-600 mt-0.5">
                        {item.result}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Variant Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-title-sm text-title-sm font-semibold text-on-surface">
                    Bảng cấu hình biến thể &amp; SKU riêng
                  </h3>
                  <p className="font-body-sm text-body-sm text-outline">
                    Tổ hợp giữa Size (M, L, XL) và Màu sắc (Trắng, Đen, Be)
                  </p>
                </div>
                <button
                  className="inline-flex items-center gap-1.5 text-primary text-label-md font-label-md font-semibold hover:underline cursor-pointer bg-transparent border-none"
                  type="button"
                  onClick={handleAddVariant}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                    add_circle
                  </span>
                  <span>Thêm biến thể</span>
                </button>
              </div>

              {/* Table */}
              <div className="border border-outline-variant rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[640px]">
                    <thead>
                      <tr className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider border-b border-outline-variant">
                        <th className="py-3 px-4 font-semibold">Màu sắc</th>
                        <th className="py-3 px-4 font-semibold">Size</th>
                        <th className="py-3 px-4 font-semibold">Mã SKU</th>
                        <th className="py-3 px-4 font-semibold">Mã phụ AI</th>
                        <th className="py-3 px-4 font-semibold text-right">Tồn kho</th>
                        <th className="py-3 px-4 font-semibold text-right">Giá Live (₫)</th>
                        <th className="py-3 px-3 text-center font-semibold">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant text-body-md font-body-md">
                      {variants.map((v, idx) => (
                        <tr
                          key={v.id}
                          className={`hover:bg-surface-container-low/40 transition-colors ${idx % 2 === 1 ? "bg-surface-container-lowest" : ""}`}
                        >
                          <td className="py-2.5 px-4 font-medium">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-outline-variant shadow-sm inline-block shrink-0"
                                style={{ backgroundColor: v.colorHex }}
                              />
                              <input
                                className="w-24 h-8 px-2 rounded border border-outline-variant bg-surface-container-lowest"
                                aria-label="Màu sắc"
                                required
                                value={v.color}
                                onChange={(e) => updateVariant(v.id, { color: e.target.value })}
                              />
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <input
                              className="w-16 h-8 px-2 rounded border border-outline-variant bg-surface-container-lowest font-semibold text-primary"
                              aria-label="Size"
                              required
                              value={v.size}
                              onChange={(e) => updateVariant(v.id, { size: e.target.value })}
                            />
                          </td>
                          <td className="py-2.5 px-4">
                            <input
                              className="w-36 h-8 px-2 rounded border border-outline-variant bg-surface-container-lowest font-mono text-body-sm"
                              aria-label="Mã SKU"
                              required
                              maxLength={50}
                              value={v.sku}
                              onChange={(e) => updateVariant(v.id, { sku: e.target.value })}
                            />
                          </td>
                          <td className="py-2.5 px-4">
                            <input
                              className="w-24 h-8 px-2 rounded border border-outline-variant bg-surface-container-lowest font-mono text-xs"
                              aria-label="Mã phụ AI"
                              required
                              maxLength={50}
                              value={v.aiCode}
                              onChange={(e) => updateVariant(v.id, { aiCode: e.target.value })}
                            />
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <input
                              className="w-20 h-8 text-right font-medium text-on-surface px-2 rounded border border-outline-variant bg-surface-container-lowest focus:ring-1 focus:ring-primary focus:outline-none"
                              type="number"
                              min={0}
                              value={v.stock}
                              onChange={(e) =>
                                handleVariantStockChange(v.id, Number(e.target.value))
                              }
                            />
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <input
                              className="w-28 h-8 text-right font-semibold px-2 rounded border border-outline-variant bg-surface-container-lowest"
                              aria-label="Giá Live"
                              inputMode="numeric"
                              value={formatVnd(v.livePrice)}
                              onChange={(e) =>
                                updateVariant(v.id, { livePrice: parseInt(e.target.value.replace(/\D/g, ""), 10) || 0 })
                              }
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              className="text-outline hover:text-error transition-colors p-1 cursor-pointer bg-transparent border-none"
                              type="button"
                              onClick={() => handleDeleteVariant(v.id)}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                                delete
                              </span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer summary */}
              <div className="flex items-center justify-between mt-3 text-body-sm font-body-sm text-outline">
                <span>
                  Tổng {variants.length} biến thể kích hoạt • Tổng tồn kho phân bổ:{" "}
                  <strong className="text-on-surface">{totalVariantStock} cái</strong>
                </span>
                <div className="flex gap-2">
                  <button
                    className="text-primary hover:underline font-medium cursor-pointer bg-transparent border-none"
                    type="button"
                    onClick={handleApplyPrice}
                  >
                    Áp dụng giá chung
                  </button>
                  <span>•</span>
                  <button
                    className="text-primary hover:underline font-medium cursor-pointer bg-transparent border-none"
                    type="button"
                    onClick={handleApplyStock}
                  >
                    Đặt tồn đồng loạt
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ===== RIGHT COLUMN (4 cols) ===== */}
        <div className="col-span-12 xl:col-span-4 flex flex-col gap-6">
          {/* 1. Card: Trạng thái bán hàng */}
          <SectionCard>
            <SectionHeader icon="toggle_on" title="Trạng thái bán hàng" />
            <div className="space-y-2.5">
              {/* Active */}
              <label
                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                  productStatus === "active"
                    ? "border-2 border-primary-container bg-primary-fixed/20"
                    : "border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low"
                }`}
              >
                <div className={`${styles.statusOptionContent} flex items-center gap-3`}>
                  <input
                    checked={productStatus === "active"}
                    className={`${styles.statusOptionRadio} text-primary focus:ring-primary border-outline accent-primary`}
                    name="product_status"
                    type="radio"
                    value="active"
                    onChange={() => setProductStatus("active")}
                  />
                  <div className={`${styles.statusOptionText} min-w-0`}>
                    <span className="font-label-md text-label-md font-bold text-on-surface block">
                      Đang bán (Active)
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      Sẵn sàng nhận diện &amp; chốt đơn live
                    </span>
                  </div>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shrink-0" />
              </label>

              {/* Draft */}
              <label
                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                  productStatus === "draft"
                    ? "border-2 border-primary-container bg-primary-fixed/20"
                    : "border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low"
                }`}
              >
                <div className={`${styles.statusOptionContent} flex items-center gap-3`}>
                  <input
                    checked={productStatus === "draft"}
                    className={`${styles.statusOptionRadio} text-primary focus:ring-primary border-outline accent-primary`}
                    name="product_status"
                    type="radio"
                    value="draft"
                    onChange={() => setProductStatus("draft")}
                  />
                  <div className={`${styles.statusOptionText} min-w-0`}>
                    <span className="font-label-md text-label-md font-semibold text-on-surface block">
                      Nháp (Draft)
                    </span>
                    <span className="font-body-sm text-body-sm text-outline">
                      Chỉ lưu thông tin, chưa kích hoạt AI
                    </span>
                  </div>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
              </label>

              {/* Inactive */}
              <label
                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                  productStatus === "inactive"
                    ? "border-2 border-primary-container bg-primary-fixed/20"
                    : "border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low"
                }`}
              >
                <div className={`${styles.statusOptionContent} flex items-center gap-3`}>
                  <input
                    checked={productStatus === "inactive"}
                    className={`${styles.statusOptionRadio} text-primary focus:ring-primary border-outline accent-primary`}
                    name="product_status"
                    type="radio"
                    value="inactive"
                    onChange={() => setProductStatus("inactive")}
                  />
                  <div className={`${styles.statusOptionText} min-w-0`}>
                    <span className="font-label-md text-label-md font-semibold text-on-surface block">
                      Ngừng bán (Inactive)
                    </span>
                    <span className="font-body-sm text-body-sm text-outline">
                      Tạm dừng khớp lệnh comment
                    </span>
                  </div>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-outline shrink-0" />
              </label>
            </div>
          </SectionCard>

          {/* 2. Card: Hình ảnh sản phẩm */}
          <SectionCard>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-outline-variant/60">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: "20px" }}>
                  photo_library
                </span>
                <h2 className="font-title-sm text-title-sm font-semibold text-on-surface">
                  Hình ảnh sản phẩm
                </h2>
              </div>
              <span className="font-label-sm text-label-sm text-outline">
                Tối đa 8 ảnh (Tỉ lệ 1:1)
              </span>
            </div>

            {/* Drag & Drop Zone */}
            <input ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => handleImageSelection(event.target.files)} />
            <button
              className="w-full border-2 border-dashed border-outline-variant hover:border-primary-container bg-surface-container-low/50 hover:bg-surface-container-high/30 rounded-xl p-5 text-center cursor-pointer transition-all duration-150 mb-4 group"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); handleImageSelection(event.dataTransfer.files); }}
            >
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-surface-container-highest/60 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>
                  cloud_upload
                </span>
              </div>
              <p className="font-label-md text-label-md font-semibold text-on-surface mb-0.5">
                Kéo thả ảnh vào đây, hoặc{" "}
                <span className="text-primary underline">chọn từ máy tính</span>
              </p>
              <p className="font-body-sm text-body-sm text-outline">
                Hỗ trợ PNG, JPG, WebP chất lượng cao
              </p>
            </button>

            {/* Thumbnails */}
            <div>
              <label className="block font-label-sm text-label-sm font-semibold text-on-surface-variant mb-2">
                Ảnh đã tải lên (3 ảnh)
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {images.map(({ file, previewUrl }, index) => (
                  <div key={`${file.name}-${file.lastModified}`} className="relative rounded-lg overflow-hidden border-2 border-primary-container aspect-square shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="w-full h-full object-cover" src={previewUrl} alt={`Product image ${index + 1}`} />
                    <button aria-label={`Remove image ${index + 1}`} className="absolute top-1 right-1 w-7 h-7 rounded bg-surface-container-lowest text-error flex items-center justify-center shadow cursor-pointer border-none" type="button" onClick={() => setImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}>
                      <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>delete</span>
                    </button>
                  </div>
                ))}
                {images.length === 0 && <>
                {/* Thumbnail 1 - Cover */}
                <div className="relative group rounded-lg overflow-hidden border-2 border-primary-container aspect-square shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="w-full h-full object-cover"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBafg4Ga7tht0r7ZohebqlUoRs8CeTmU5FZ37c5Qbd7APhJ6EKjuvbGBezctoFbVpSian1wFp1SxErLQqQU9YgQ9caWyFS_hTGClMSPNRd4DAmvsDKk_bcv5WEHi9CAdeKSjW8XgAe9YUomY0P9Xf6domsbY0ucelwf8tQD_B-YRNaEoteXtXkWr9QNh7B75t-eK9ax17t9PNBQfkTd5CqNjgi2HWPSAQFPdd3eloXMKNJNYjEXTjUt"
                    alt="Ảnh sản phẩm chính"
                  />
                  <span className="absolute top-1 left-1 bg-primary text-on-primary text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                    Ảnh bìa
                  </span>
                  <div className="absolute inset-0 bg-inverse-surface/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <button
                      className="w-7 h-7 rounded bg-surface-container-lowest text-error flex items-center justify-center shadow hover:scale-105 cursor-pointer border-none"
                      type="button"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                        delete
                      </span>
                    </button>
                  </div>
                </div>

                {/* Thumbnail 2 */}
                <div className="relative group rounded-lg overflow-hidden border border-outline-variant aspect-square shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="w-full h-full object-cover"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCze2RQgwsRViUplGuqiVQMVaO-JANHX1KYfn6-qCRO3G4_O_4E_A3TaH_J_gZ_6oNWaJyYLbo0YA4bTTJlg6uyLNmDemfpDPnif32qkK3F8IusBjQoGYIGIv9xJxcdzo7qaTeDoETbX_AFnBe_iXvGLIEgtOAbnfmjyo3qUfXgtyRYOxHEcR5X1Y1ImdwNlfn5RynGQQO9zJnOKM1rlI0w3TyAKWiXCDcQENHqR0P0SY_MSXsvsRi_"
                    alt="Ảnh sản phẩm 2"
                  />
                  <div className="absolute inset-0 bg-inverse-surface/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <button
                      className="w-7 h-7 rounded bg-surface-container-lowest text-error flex items-center justify-center shadow hover:scale-105 cursor-pointer border-none"
                      type="button"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                        delete
                      </span>
                    </button>
                  </div>
                </div>

                {/* Thumbnail 3 */}
                <div className="relative group rounded-lg overflow-hidden border border-outline-variant aspect-square shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="w-full h-full object-cover"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuDi0da_GLmgA2WG7t0R1q_bLtXSB_qawzftdjaWXlNqQ1cR0-Qas79LJniEwjqSmEls_DxVersTB6CaRPm5uqlZYGeE5BXq43iJ9GxaU4Ea8xM0tOslM9Xyr1dcAqXdR1tJK9q5_oEDBHLXmRoMAuYLNwkSe2dW0OUmo_clcWH-26qjHnrfYafgzEC6dizMvkCbcCsrmREGDi0LnxYNstvJuDuIXNIB9slgu9naB5dluIfuRxFq1ls2"
                    alt="Ảnh sản phẩm 3"
                  />
                  <div className="absolute inset-0 bg-inverse-surface/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <button
                      className="w-7 h-7 rounded bg-surface-container-lowest text-error flex items-center justify-center shadow hover:scale-105 cursor-pointer border-none"
                      type="button"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                        delete
                      </span>
                    </button>
                  </div>
                </div>
                </>}
              </div>
            </div>
          </SectionCard>

          {/* 3. Card: Thuộc tính vận chuyển */}
          <SectionCard>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-outline-variant/60">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: "20px" }}>
                  local_shipping
                </span>
                <h2 className="font-title-sm text-title-sm font-semibold text-on-surface">
                  Thuộc tính vận chuyển
                </h2>
              </div>
              <span className="font-label-sm text-label-sm text-tertiary font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-tertiary" />
                GHN / GHTK API
              </span>
            </div>

            <div className="space-y-4">
              {/* Trọng lượng */}
              <div>
                <label className="block font-label-md text-label-md font-medium text-on-surface mb-1.5">
                  Trọng lượng đóng gói (sau khi bọc chống sốc){" "}
                  <span className="text-error">*</span>
                </label>
                <div className="relative">
                  <input
                    aria-label="Trọng lượng đóng gói"
                    className={`${styles.numberInputWithSuffix} w-full font-body-md text-body-md font-semibold text-on-surface rounded-lg border border-outline-variant bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/20 transition-all`}
                    type="number"
                    value={weight}
                    onChange={(e) => setWeight(Number(e.target.value))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label-sm text-label-sm text-outline font-medium">
                    Gram (g)
                  </span>
                </div>
              </div>

              {/* Kích thước */}
              <div>
                <label className="block font-label-md text-label-md font-medium text-on-surface mb-1.5">
                  Kích thước bưu kiện (Dài × Rộng × Cao)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Dài", value: dimL, setter: setDimL },
                    { label: "Rộng", value: dimW, setter: setDimW },
                    { label: "Cao", value: dimH, setter: setDimH },
                  ].map(({ label, value, setter }) => (
                    <div key={label} className="relative">
                      <input
                        aria-label={`Kích thước ${label.toLowerCase()} (cm)`}
                        className={`${styles.numberInputWithCompactSuffix} w-full text-center font-body-md text-body-md font-medium text-on-surface rounded-lg border border-outline-variant bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/20 focus:outline-none`}
                        placeholder={label}
                        type="number"
                        value={value}
                        onChange={(e) => setter(Number(e.target.value))}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-outline">
                        cm
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cước ước tính */}
              <div className="p-3 bg-surface-container-low rounded-lg border border-outline-variant text-body-sm font-body-sm flex items-center justify-between text-on-surface-variant">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: "16px" }}>
                    calculate
                  </span>
                  <span>Ước tính cước nội thành HN/HCM:</span>
                </div>
                <span className="font-bold text-on-surface">16.500 ₫</span>
              </div>
            </div>
          </SectionCard>

          {/* 4. Auto-save helper */}
          <div className="p-4 rounded-xl bg-surface-container border border-outline-variant flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="font-body-sm text-body-sm text-on-surface font-medium">
                Tự động lưu nháp 1 phút trước
              </span>
            </div>
            <button
              className="text-primary font-label-sm text-label-sm font-bold hover:underline cursor-pointer bg-transparent border-none"
              type="button"
              onClick={() => alert("Xem lịch sử lưu nháp")}
            >
              Xem lịch sử
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
