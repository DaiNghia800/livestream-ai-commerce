"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./product.module.css";
import {
  createProduct,
  createProductCategory,
  getProducts,
  getProductCategories,
  getImageContentHash,
  ProductApiError,
  uploadProductImage,
  type ProductCategory,
  type ProductSkuInput,
} from "./api/products";

// ===== Types =====
interface VariantRow {
  id: string;
  color: string;
  size: string;
  sku: string;
  aiCode: string;
  stock: number;
  livePrice: number;
}

type VariantField = "color" | "size" | "sku" | "aiCode" | "stock" | "livePrice";
type VariantErrors = Record<string, Partial<Record<VariantField, string>>>;
type AttributeNameField = "first" | "second";

type PricingField = "listedPrice" | "livePrice" | "stockWarning";

// ===== Helper =====
const COLOR_SKU_CODES: Record<string, string> = {
  trắng: "WHT",
  đen: "BLK",
  be: "BEI",
  đỏ: "RED",
  "xanh dương": "BLU",
  "xanh lá": "GRN",
  vàng: "YLW",
  hồng: "PNK",
  tím: "PUR",
  nâu: "BRN",
  xám: "GRY",
};

function normalizeVariantValue(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLocaleLowerCase();
}

function toCodePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function getColorSkuCode(color: string) {
  const normalizedColor = color.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return COLOR_SKU_CODES[normalizedColor] ??
    normalizedColor.split(/\s+/).map(toCodePart).join("").slice(0, 3);
}

function generateVariantCodes(variant: VariantRow, triggerCode: string) {
  const mainCode = triggerCode.trim().toUpperCase();
  const firstValue = variant.color.trim();
  const secondValue = toCodePart(variant.size);
  if (!mainCode || !firstValue || !secondValue) return { sku: "", aiCode: "" };

  const firstValueInitial = toCodePart(firstValue).slice(0, 1);
  return {
    sku: `${mainCode}-${getColorSkuCode(firstValue)}-${secondValue}`,
    aiCode: `${toCodePart(mainCode)}${firstValueInitial}${secondValue}`,
  };
}

function formatVnd(value: number | string) {
  const num = typeof value === "string" ? parseInt(value.replace(/\D/g, ""), 10) : value;
  if (isNaN(num)) return "";
  return num.toLocaleString("vi-VN");
}

function parseVnd(value: string): number | null {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : null;
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
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-6 w-5 shrink-0 items-center justify-center">
          <span className="material-symbols-outlined text-primary leading-none" style={{ fontSize: "20px" }}>
            {icon}
          </span>
        </span>
        <h2 className="m-0 font-title-sm text-title-sm font-semibold leading-6 text-on-surface">{title}</h2>
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
        className="w-full h-10 px-3.5 text-body-md font-body-md rounded-lg border border-outline-variant bg-surface-container-lowest focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 transition-all text-on-surface placeholder:text-outline"
        {...props}
      />
    </div>
  );
}

// ===== MAIN PAGE =====
export function CreateProductPage() {
  const router = useRouter();

  // Form state
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [listedPrice, setListedPrice] = useState("0");
  const [livePrice, setLivePrice] = useState("0");
  const [stockWarning, setStockWarning] = useState("0");
  const [pricingErrors, setPricingErrors] = useState<Partial<Record<PricingField, string>>>({});
  const [variantErrors, setVariantErrors] = useState<VariantErrors>({});
  const [triggerCode, setTriggerCode] = useState("");
  const [codeCheck, setCodeCheck] = useState<"idle" | "checking" | "available" | "duplicate" | "unknown">("idle");
  const [productStatus, setProductStatus] = useState<"active" | "draft" | "inactive">("active");
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [firstAttributeName, setFirstAttributeName] = useState("Màu sắc");
  const [secondAttributeName, setSecondAttributeName] = useState("Size");
  const [attributeNameErrors, setAttributeNameErrors] = useState<
    Partial<Record<AttributeNameField, string>>
  >({});
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [images, setImages] = useState<
    { file: File; previewUrl: string; fingerprint: string }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalVariantStock = variants.reduce((sum, variant) => {
    return sum + (Number.isFinite(variant.stock) ? variant.stock : 0);
  }, 0);
  const totalStock = String(totalVariantStock);
  const nameLength = productName.length;

  const validatePricingField = (field: PricingField, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "Trường này không được để trống.";

    if (field === "listedPrice" || field === "livePrice") {
      if (!/^\d+(?:[.,\s]\d{3})*$/.test(trimmed) || parseVnd(trimmed) === null) {
        return "Chỉ nhập số tiền không âm.";
      }
      return "";
    }

    const number = Number(trimmed);
    if (!Number.isSafeInteger(number) || number < 0) {
      return "Nhập số nguyên không âm.";
    }
    return "";
  };

  const updatePricingField = (field: PricingField, value: string) => {
    const setters: Record<PricingField, (nextValue: string) => void> = {
      listedPrice: setListedPrice,
      livePrice: setLivePrice,
      stockWarning: setStockWarning,
    };
    setters[field](value);
    const nextListedPrice = field === "listedPrice" ? value : listedPrice;
    const nextLivePrice = field === "livePrice" ? value : livePrice;
    const nextErrors: Partial<Record<PricingField, string>> = {
      listedPrice: validatePricingField("listedPrice", nextListedPrice),
      livePrice: validatePricingField("livePrice", nextLivePrice),
      stockWarning:
        field === "stockWarning"
          ? validatePricingField("stockWarning", value)
          : pricingErrors.stockWarning,
    };
    const listed = parseVnd(nextListedPrice);
    const live = parseVnd(nextLivePrice);
    if (!nextErrors.listedPrice && !nextErrors.livePrice && listed !== null && live !== null && listed < live) {
      nextErrors.listedPrice = "Giá niêm yết không được nhỏ hơn Giá Flash Live.";
      nextErrors.livePrice = "Giá Flash Live không được vượt quá giá niêm yết.";
    }
    setPricingErrors(nextErrors);
    if (field === "livePrice") {
      const price = parseVnd(value) ?? 0;
      setVariants((current) => {
        const next = current.map((variant) => ({ ...variant, livePrice: price }));
        setVariantErrors(validateVariants(next));
        return next;
      });
    }
  };

  const formatPriceOnBlur = (field: "listedPrice" | "livePrice", value: string) => {
    const parsedPrice = parseVnd(value);
    const formattedValue =
      parsedPrice !== null && !validatePricingField(field, value)
        ? formatVnd(parsedPrice)
        : value;
    updatePricingField(field, formattedValue);
  };

  const validateVariants = (rows: VariantRow[]): VariantErrors => {
    const errors: VariantErrors = {};
    const setFieldError = (id: string, field: VariantField, message: string) => {
      if (!message) return;
      errors[id] = { ...errors[id], [field]: message };
    };

    rows.forEach((variant) => {
      const codes = generateVariantCodes(variant, triggerCode);
      setFieldError(
        variant.id,
        "color",
        variant.color.trim() ? "" : `${firstAttributeName} không được để trống.`
      );
      setFieldError(
        variant.id,
        "size",
        variant.size.trim() ? "" : `${secondAttributeName} không được để trống.`
      );
      setFieldError(
        variant.id,
        "sku",
        codes.sku
          ? codes.sku.length <= 50
            ? ""
            : "Mã SKU không được vượt quá 50 ký tự."
          : `Không thể tạo mã SKU khi thiếu mã chốt đơn, ${firstAttributeName} hoặc ${secondAttributeName}.`
      );
      setFieldError(
        variant.id,
        "aiCode",
        codes.aiCode
          ? codes.aiCode.length <= 50
            ? ""
            : "Mã phụ AI không được vượt quá 50 ký tự."
          : `Không thể tạo mã phụ AI khi thiếu mã chốt đơn, ${firstAttributeName} hoặc ${secondAttributeName}.`
      );
      setFieldError(
        variant.id,
        "stock",
        Number.isSafeInteger(variant.stock) && variant.stock >= 0 ? "" : "Tồn kho phải là số nguyên không âm."
      );
      setFieldError(
        variant.id,
        "livePrice",
        Number.isSafeInteger(variant.livePrice) && variant.livePrice >= 0
          ? ""
          : "Giá Live phải là số nguyên không âm."
      );
    });

    const addDuplicates = (field: "color" | "sku" | "aiCode", values: string[]) => {
      const grouped = new Map<string, string[]>();
      values.forEach((value, index) => {
        const key = normalizeVariantValue(value);
        if (!key) return;
        grouped.set(key, [...(grouped.get(key) ?? []), rows[index].id]);
      });
      grouped.forEach((ids) => {
        if (ids.length < 2) return;
        ids.forEach((id) => {
          setFieldError(
            id,
            field,
            field === "color"
              ? "Màu sắc chỉ được lặp lại khi size khác nhau."
              : field === "sku"
                ? "Mã SKU bị trùng."
                : "Mã phụ AI bị trùng."
          );
        });
      });
    };

    addDuplicates("sku", rows.map((variant) => generateVariantCodes(variant, triggerCode).sku));
    addDuplicates("aiCode", rows.map((variant) => generateVariantCodes(variant, triggerCode).aiCode));

    const colorSizes = new Map<string, string[]>();
    rows.forEach((variant) => {
      const color = normalizeVariantValue(variant.color);
      const size = normalizeVariantValue(variant.size);
      if (!color) return;
      colorSizes.set(color, [...(colorSizes.get(color) ?? []), size]);
    });
    colorSizes.forEach((sizes, color) => {
      if (new Set(sizes).size === sizes.length) return;
      rows.forEach((variant) => {
        if (normalizeVariantValue(variant.color) === color) {
          const message = `Không thể có hai biến thể trùng tổ hợp ${firstAttributeName} và ${secondAttributeName}.`;
          setFieldError(variant.id, "color", message);
          setFieldError(variant.id, "size", message);
        }
      });
    });

    return errors;
  };

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
    setVariants((prev) => {
      const next = prev.filter((variant) => variant.id !== id);
      setVariantErrors(validateVariants(next));
      return next;
    });
  };

  const handleVariantStockChange = (id: string, val: number) => {
    setVariants((prev) => {
      const next = prev.map((variant) => (variant.id === id ? { ...variant, stock: val } : variant));
      setVariantErrors(validateVariants(next));
      return next;
    });
  };

  const updateVariant = (id: string, patch: Partial<VariantRow>) => {
    setVariants((prev) => {
      const next = prev.map((variant) => {
        if (variant.id !== id) return variant;
        const updated = { ...variant, ...patch };
        return { ...updated, ...generateVariantCodes(updated, triggerCode) };
      });
      setVariantErrors(validateVariants(next));
      return next;
    });
  };

  const handleAddVariant = () => {
    const price = parseInt(livePrice.replace(/\D/g, ""), 10) || 0;
    setVariants((prev) => {
      const next = [
        ...prev,
        {
        id: `${Date.now()}-${prev.length}`,
        color: "",
        size: "",
        sku: "",
        aiCode: "",
        stock: 0,
        livePrice: price,
        },
      ];
      setVariantErrors(validateVariants(next));
      return next;
    });
  };

  const handleTriggerCodeChange = (value: string) => {
    const nextTriggerCode = value.toUpperCase();
    setTriggerCode(nextTriggerCode);
    setVariants((prev) => {
      const next = prev.map((variant) => ({
        ...variant,
        ...generateVariantCodes(variant, nextTriggerCode),
      }));
      setVariantErrors(validateVariants(next));
      return next;
    });
  };

  const handleImageSelection = async (fileList: FileList | null) => {
    if (!fileList) return;
    const selected = Array.from(fileList);
    const invalid = selected.find(
      (file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024
    );
    if (invalid) {
      setError("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP có dung lượng tối đa 5MB.");
      return;
    }
    let fingerprinted: { file: File; fingerprint: string }[];
    try {
      fingerprinted = await Promise.all(
        selected.map(async (file) => ({ file, fingerprint: await getImageContentHash(file) }))
      );
    } catch (fingerprintError) {
      setError(
        fingerprintError instanceof Error
          ? `Không thể kiểm tra ảnh: ${fingerprintError.message}`
          : "Không thể kiểm tra ảnh đã chọn."
      );
      return;
    }
    const seen = new Set(images.map((image) => image.fingerprint));
    let duplicateFound = false;
    const unique = fingerprinted.filter(({ fingerprint }) => {
      if (seen.has(fingerprint)) {
        duplicateFound = true;
        return false;
      }
      seen.add(fingerprint);
      return true;
    });
    if (images.length + unique.length > 8) {
      setError("Mỗi sản phẩm có thể có tối đa 8 ảnh.");
      return;
    }
    setError(duplicateFound ? "Ảnh sản phẩm không được trùng nhau." : "");
    setImages((current) => [
      ...current,
      ...unique.map(({ file, fingerprint }) => ({
        file,
        fingerprint,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async () => {
    setError("");
    const nextAttributeNameErrors: Partial<Record<AttributeNameField, string>> = {};
    if (!firstAttributeName.trim()) {
      nextAttributeNameErrors.first = "Tên thuộc tính thứ nhất không được để trống.";
    }
    if (!secondAttributeName.trim()) {
      nextAttributeNameErrors.second = "Tên thuộc tính thứ hai không được để trống.";
    }
    if (
      firstAttributeName.trim() &&
      secondAttributeName.trim() &&
      normalizeVariantValue(firstAttributeName) === normalizeVariantValue(secondAttributeName)
    ) {
      nextAttributeNameErrors.first = "Tên hai thuộc tính phải khác nhau.";
      nextAttributeNameErrors.second = "Tên hai thuộc tính phải khác nhau.";
    }
    setAttributeNameErrors(nextAttributeNameErrors);
    if (Object.keys(nextAttributeNameErrors).length > 0) {
      setError("Vui lòng kiểm tra tên hai thuộc tính của biến thể.");
      return;
    }

    const nextPricingErrors: Partial<Record<PricingField, string>> = {};
    (["listedPrice", "livePrice", "stockWarning"] as const).forEach((field) => {
      const value = { listedPrice, livePrice, stockWarning }[field];
      const fieldError = validatePricingField(field, value);
      if (fieldError) nextPricingErrors[field] = fieldError;
    });
    const listed = parseVnd(listedPrice);
    const live = parseVnd(livePrice);
    if (
      !nextPricingErrors.listedPrice &&
      !nextPricingErrors.livePrice &&
      listed !== null &&
      live !== null &&
      listed < live
    ) {
      nextPricingErrors.listedPrice = "Giá niêm yết không được nhỏ hơn Giá Flash Live.";
      nextPricingErrors.livePrice = "Giá Flash Live không được vượt quá giá niêm yết.";
    }
    setPricingErrors(nextPricingErrors);
    if (Object.keys(nextPricingErrors).length > 0) return;

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
    const codeValue = triggerCode.trim();
    if (!variants.length) {
      setError("Cần có ít nhất một biến thể sản phẩm.");
      return;
    }
    const nextVariantErrors = validateVariants(variants);
    setVariantErrors(nextVariantErrors);
    const firstVariantError = Object.values(nextVariantErrors)
      .flatMap((fieldErrors) => Object.values(fieldErrors))
      .find(Boolean);
    if (firstVariantError) {
      setError(firstVariantError);
      return;
    }
    const skus: ProductSkuInput[] = variants.map((variant) => ({
      skuCode: variant.sku.trim(),
      variantName: `${firstAttributeName.trim()}: ${variant.color.trim()} / ${secondAttributeName.trim()}: ${variant.size.trim()}`,
      price: variant.livePrice,
      aiCode: variant.aiCode.trim() || null,
      stock: Math.max(0, Math.floor(variant.stock) || 0),
      status: "active",
    }));

    setSaving(true);
    try {
      const matchingCategory = categories.find(
        (item) => item.name.trim().toLocaleLowerCase() === newCategory.trim().toLocaleLowerCase()
      );
      const categoryId = newCategory.trim()
        ? (matchingCategory ?? await createProductCategory(newCategory.trim())).id
        : categories.find((item) => String(item.id) === category)?.id ?? null;
      const uploadedImages = await Promise.all(
        images.map(async ({ file, fingerprint }, index) => ({
          url: await uploadProductImage(file),
          contentHash: fingerprint,
          isPrimary: index === 0,
          sortOrder: index,
        }))
      );
      await createProduct({
        code: codeValue,
        name: productName.trim(),
        categoryId,
        description: description.trim() || null,
        brand: brand.trim() || null,
        listPrice: parseVnd(listedPrice),
        stockWarning: Number(stockWarning),
        triggerCode: triggerCode.trim() || null,
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
                placeholder="VD: Áo Sơ Mi Linen Cổ Tàu Dài Tay..."
                value={productName}
                maxLength={120}
                onChange={(e) => setProductName(e.target.value)}
                right={
                  <span className="font-label-sm text-label-sm text-outline">
                    {nameLength} / 120 ký tự
                  </span>
                }
              />

              {/* Danh mục & Thương hiệu */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-label-md text-label-md font-medium text-on-surface mb-1.5">
                    Danh mục hàng hóa
                  </label>
                  <input
                    aria-label="Nhập danh mục mới"
                    className="mb-2 w-full h-10 px-3 text-body-md font-body-md rounded-lg border border-outline-variant bg-surface-container-lowest focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 transition-all text-on-surface placeholder:text-outline"
                    type="text"
                    maxLength={150}
                    placeholder="Nhập danh mục mới"
                    value={newCategory}
                    onChange={(e) => {
                      setNewCategory(e.target.value);
                      setCategory("");
                    }}
                  />
                  <select
                    aria-label="Chọn danh mục đã có"
                    className="w-full h-10 px-3 text-body-md font-body-md rounded-lg border border-outline-variant bg-surface-container-lowest focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 transition-all text-on-surface cursor-pointer"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setNewCategory("");
                    }}
                  >
                    <option value="">Chưa phân loại</option>
                    {categories.map((item) => (
                      <option key={item.id} value={String(item.id)}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <FormInput
                  label="Thương hiệu / Nhãn hiệu"
                  placeholder="VD: Linen Heritage Vietnam"
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
                    aria-label="Mô tả chi tiết sản phẩm"
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {/* Giá niêm yết */}
              <div className="bg-surface-container-low/50 p-3.5 rounded-lg border border-outline-variant">
                <label className="block font-label-sm text-label-sm font-medium text-on-surface-variant mb-1">
                  Giá niêm yết (VND) <span className="text-error">*</span>
                </label>
                <div className="relative">
                  <input
                    aria-label="Giá niêm yết (VND)"
                    aria-invalid={Boolean(pricingErrors.listedPrice)}
                    aria-describedby={pricingErrors.listedPrice ? "listed-price-error" : undefined}
                    className={`w-full h-10 pr-8 pl-3 font-title-sm text-title-sm font-bold text-on-surface rounded-lg border bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/20 focus:border-primary-container transition-all ${pricingErrors.listedPrice ? "border-error" : "border-outline-variant"}`}
                    type="text"
                    inputMode="numeric"
                    required
                    value={listedPrice}
                    onChange={(e) => updatePricingField("listedPrice", e.target.value)}
                    onBlur={() => formatPriceOnBlur("listedPrice", listedPrice)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label-sm text-label-sm text-outline">
                    ₫
                  </span>
                </div>
                {pricingErrors.listedPrice && (
                  <p id="listed-price-error" className="mt-1 text-body-sm text-error" role="alert">
                    {pricingErrors.listedPrice}
                  </p>
                )}
                <p className="font-body-sm text-body-sm text-outline mt-1">Giá bán lẻ trên web</p>
              </div>

              {/* Giá Flash Live */}
              <div className="bg-primary-fixed/20 p-3.5 rounded-lg border border-primary-fixed-dim">
                <label className="mb-1 block font-label-sm text-label-sm font-bold text-primary">
                  Giá Flash Live (VND) *
                </label>
                <div className="relative">
                  <input
                    aria-label="Giá Flash Live (VND)"
                    aria-invalid={Boolean(pricingErrors.livePrice)}
                    aria-describedby={pricingErrors.livePrice ? "live-price-error" : undefined}
                    className={`w-full h-10 pr-8 pl-3 font-title-sm text-title-sm font-bold text-primary rounded-lg border bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/30 transition-all ${pricingErrors.livePrice ? "border-error" : "border-primary-container"}`}
                    type="text"
                    inputMode="numeric"
                    required
                    value={livePrice}
                    onChange={(e) => updatePricingField("livePrice", e.target.value)}
                    onBlur={() => formatPriceOnBlur("livePrice", livePrice)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label-sm text-label-sm text-primary font-bold">
                    ₫
                  </span>
                </div>
                {pricingErrors.livePrice && (
                  <p id="live-price-error" className="mt-1 text-body-sm text-error" role="alert">
                    {pricingErrors.livePrice}
                  </p>
                )}
                <p className="font-body-sm text-body-sm text-on-primary-fixed-variant mt-1 font-medium">
                  Giá áp dụng khi khách chốt qua bot
                </p>
              </div>

              {/* Tổng tồn kho nhập */}
              <div className="bg-surface-container-low/50 p-3.5 rounded-lg border border-outline-variant">
                <label className="block font-label-sm text-label-sm font-medium text-on-surface-variant mb-1">
                  Tổng tồn kho nhập <span className="text-error">*</span>
                </label>
                <div className="relative">
                  <input
                    aria-label="Tổng tồn kho nhập"
                    className={`${styles.numberInputWithSuffix} w-full font-title-sm text-title-sm font-bold text-on-surface rounded-lg border border-outline-variant bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/20 transition-all`}
                    type="number"
                    value={totalStock}
                    readOnly
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
                  Ngưỡng cảnh báo <span className="text-error">*</span>
                </label>
                <div className="relative">
                  <input
                    aria-label="Ngưỡng cảnh báo tồn kho"
                    aria-invalid={Boolean(pricingErrors.stockWarning)}
                    aria-describedby={pricingErrors.stockWarning ? "stock-warning-error" : undefined}
                    className={`${styles.numberInputWithSuffix} w-full font-title-sm text-title-sm font-bold text-error rounded-lg border bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/20 transition-all ${pricingErrors.stockWarning ? "border-error" : "border-outline-variant"}`}
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={stockWarning}
                    onChange={(e) => updatePricingField("stockWarning", e.target.value)}
                    onBlur={() => updatePricingField("stockWarning", stockWarning)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label-sm text-label-sm text-outline">
                    Cái
                  </span>
                </div>
                {pricingErrors.stockWarning && (
                  <p id="stock-warning-error" className="mt-1 text-body-sm text-error" role="alert">
                    {pricingErrors.stockWarning}
                  </p>
                )}
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
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-container text-on-primary">
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                    smart_toy
                  </span>
                </div>
                <div>
                  <h2 className="font-title-sm text-title-sm font-bold leading-tight text-on-surface">
                    Thiết lập Mã Chốt Đơn AI (Order Trigger)
                  </h2>
                  <p className="-mt-2 font-body-sm text-body-sm leading-tight text-on-surface-variant">
                    Bộ não AI nhận diện comment livestream để tự động giữ hàng và tạo đơn
                  </p>
                </div>
              </div>
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
                      className={`${styles.triggerCodeInput} w-full font-metric-num text-metric-num text-primary placeholder:text-outline tracking-wider rounded-lg border-2 border-primary-container bg-surface-container-lowest focus:ring-4 focus:ring-primary-container/20 focus:outline-none transition-all`}
                      type="text"
                      placeholder="VD: AO01"
                      value={triggerCode}
                      onChange={(e) => handleTriggerCodeChange(e.target.value)}
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
                    result: "➔ SL = 2, nhận diện theo mã sản phẩm",
                  },
                  {
                    num: "2",
                    pattern: `"Lấy [SL] cái ${triggerCode}"`,
                    example: `"Lấy 1 cái ${triggerCode} kèm freeship"`,
                    result: "➔ Nhận diện hành vi chốt đơn",
                  },
                  {
                    num: "3",
                    pattern: `"${triggerCode} [${secondAttributeName} / ${firstAttributeName}]"`,
                    example: `"${triggerCode} ${secondAttributeName.toLocaleLowerCase()} <giá trị> ${firstAttributeName.toLocaleLowerCase()} <giá trị>"`,
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
                    Tổ hợp giữa {secondAttributeName} và {firstAttributeName}
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
                        <th className="py-3 px-4 font-semibold">
                          <input
                            className={`w-full min-w-20 border-0 border-b border-dashed bg-transparent p-0 font-semibold uppercase tracking-wider text-on-surface-variant outline-none focus:border-primary focus:ring-0 ${attributeNameErrors.first ? "border-error" : "border-outline-variant"}`}
                            aria-label="Tên thuộc tính thứ nhất"
                            aria-invalid={Boolean(attributeNameErrors.first)}
                            aria-describedby={attributeNameErrors.first ? "first-attribute-name-error" : undefined}
                            maxLength={30}
                            required
                            value={firstAttributeName}
                            onChange={(event) => {
                              setFirstAttributeName(event.target.value);
                              setAttributeNameErrors((current) => ({ ...current, first: undefined }));
                              setVariantErrors({});
                            }}
                          />
                          {attributeNameErrors.first && (
                            <p id="first-attribute-name-error" className="mt-1 text-body-sm text-error normal-case" role="alert">
                              {attributeNameErrors.first}
                            </p>
                          )}
                        </th>
                        <th className="py-3 px-4 font-semibold">
                          <input
                            className={`w-full min-w-16 border-0 border-b border-dashed bg-transparent p-0 font-semibold uppercase tracking-wider text-on-surface-variant outline-none focus:border-primary focus:ring-0 ${attributeNameErrors.second ? "border-error" : "border-outline-variant"}`}
                            aria-label="Tên thuộc tính thứ hai"
                            aria-invalid={Boolean(attributeNameErrors.second)}
                            aria-describedby={attributeNameErrors.second ? "second-attribute-name-error" : undefined}
                            maxLength={30}
                            required
                            value={secondAttributeName}
                            onChange={(event) => {
                              setSecondAttributeName(event.target.value);
                              setAttributeNameErrors((current) => ({ ...current, second: undefined }));
                              setVariantErrors({});
                            }}
                          />
                          {attributeNameErrors.second && (
                            <p id="second-attribute-name-error" className="mt-1 text-body-sm text-error normal-case" role="alert">
                              {attributeNameErrors.second}
                            </p>
                          )}
                        </th>
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
                            <input
                              className={`w-24 h-8 px-2 rounded border bg-surface-container-lowest ${variantErrors[v.id]?.color ? "border-error" : "border-outline-variant"}`}
                              aria-label={firstAttributeName}
                              aria-invalid={Boolean(variantErrors[v.id]?.color)}
                              aria-describedby={variantErrors[v.id]?.color ? `variant-${v.id}-color-error` : undefined}
                              required
                              maxLength={40}
                              value={v.color}
                              onChange={(e) => updateVariant(v.id, { color: e.target.value })}
                            />
                            {variantErrors[v.id]?.color && (
                              <p id={`variant-${v.id}-color-error`} className="mt-1 text-body-sm text-error" role="alert">
                                {variantErrors[v.id].color}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <input
                              className={`w-16 h-8 px-2 rounded border bg-surface-container-lowest font-semibold text-primary ${variantErrors[v.id]?.size ? "border-error" : "border-outline-variant"}`}
                              aria-label={secondAttributeName}
                              aria-invalid={Boolean(variantErrors[v.id]?.size)}
                              aria-describedby={variantErrors[v.id]?.size ? `variant-${v.id}-size-error` : undefined}
                              required
                              maxLength={40}
                              value={v.size}
                              onChange={(e) => updateVariant(v.id, { size: e.target.value })}
                            />
                            {variantErrors[v.id]?.size && (
                              <p id={`variant-${v.id}-size-error`} className="mt-1 text-body-sm text-error" role="alert">
                                {variantErrors[v.id].size}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <input
                              className={`w-36 h-8 px-2 rounded border bg-surface-container-lowest font-mono text-body-sm ${variantErrors[v.id]?.sku ? "border-error" : "border-outline-variant"}`}
                              aria-label="Mã SKU"
                              aria-invalid={Boolean(variantErrors[v.id]?.sku)}
                              aria-describedby={variantErrors[v.id]?.sku ? `variant-${v.id}-sku-error` : undefined}
                              required
                              maxLength={50}
                              readOnly
                              value={v.sku}
                            />
                            {variantErrors[v.id]?.sku && (
                              <p id={`variant-${v.id}-sku-error`} className="mt-1 text-body-sm text-error" role="alert">
                                {variantErrors[v.id].sku}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <input
                              className={`w-24 h-8 px-2 rounded border bg-surface-container-lowest font-mono text-xs ${variantErrors[v.id]?.aiCode ? "border-error" : "border-outline-variant"}`}
                              aria-label="Mã phụ AI"
                              aria-invalid={Boolean(variantErrors[v.id]?.aiCode)}
                              aria-describedby={variantErrors[v.id]?.aiCode ? `variant-${v.id}-ai-error` : undefined}
                              required
                              maxLength={50}
                              readOnly
                              value={v.aiCode}
                            />
                            {variantErrors[v.id]?.aiCode && (
                              <p id={`variant-${v.id}-ai-error`} className="mt-1 text-body-sm text-error" role="alert">
                                {variantErrors[v.id].aiCode}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <input
                              className={`w-20 h-8 text-right font-medium text-on-surface px-2 rounded border bg-surface-container-lowest focus:ring-1 focus:ring-primary focus:outline-none ${variantErrors[v.id]?.stock ? "border-error" : "border-outline-variant"}`}
                              aria-label="Tồn kho biến thể"
                              aria-invalid={Boolean(variantErrors[v.id]?.stock)}
                              aria-describedby={variantErrors[v.id]?.stock ? `variant-${v.id}-stock-error` : undefined}
                              type="number"
                              min={0}
                              step={1}
                              required
                              value={Number.isSafeInteger(v.stock) ? v.stock : ""}
                              onChange={(e) =>
                                handleVariantStockChange(v.id, e.target.value === "" ? Number.NaN : Number(e.target.value))
                              }
                            />
                            {variantErrors[v.id]?.stock && (
                              <p id={`variant-${v.id}-stock-error`} className="mt-1 text-body-sm text-error" role="alert">
                                {variantErrors[v.id].stock}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <input
                              className="w-28 h-8 text-right font-semibold px-2 rounded border border-outline-variant bg-surface-container-lowest"
                              aria-label="Giá Live"
                              inputMode="numeric"
                              readOnly
                              value={formatVnd(v.livePrice)}
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
              <div className="mt-3 text-body-sm font-body-sm text-outline">
                <span>
                  Tổng {variants.length} biến thể kích hoạt • Tổng tồn kho phân bổ:{" "}
                  <strong className="text-on-surface">{totalVariantStock} cái</strong>
                </span>
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
            <SectionHeader
              icon="photo_library"
              title="Hình ảnh sản phẩm"
              right={
                <span className="font-label-sm text-label-sm text-outline">
                  Tối đa 8 ảnh (Tỉ lệ 1:1)
                </span>
              }
            />

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
              <label className="mb-2 flex items-center gap-1.5 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                Ảnh đã tải lên ({images.length} ảnh)
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {images.map(({ previewUrl, fingerprint }, index) => (
                  <div key={fingerprint} className="relative rounded-lg overflow-hidden border-2 border-primary-container aspect-square shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="w-full h-full object-cover" src={previewUrl} alt={`Product image ${index + 1}`} />
                    <button aria-label={`Remove image ${index + 1}`} className="absolute top-1 right-1 w-7 h-7 rounded bg-surface-container-lowest text-error flex items-center justify-center shadow cursor-pointer border-none" type="button" onClick={() => {
                      URL.revokeObjectURL(previewUrl);
                      setImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>delete</span>
                    </button>
                  </div>
                ))}
                {images.length === 0 && (
                  <p className="col-span-3 rounded-lg border border-dashed border-outline-variant bg-surface-container-low/50 px-4 py-6 text-center font-body-sm text-body-sm text-outline">
                    Chưa có ảnh sản phẩm.
                  </p>
                )}
              </div>
            </div>
          </SectionCard>

        </div>
      </div>
    </>
  );
}
