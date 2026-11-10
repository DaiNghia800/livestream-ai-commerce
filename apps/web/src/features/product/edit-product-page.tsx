"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Eye,
  History,
  ImagePlus,
  Info,
  Layers,
  LoaderCircle,
  Plus,
  Radio,
  Save,
  Star,
  Trash2,
  ToggleRight,
  Upload,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import styles from "./product.module.css";
import {
  createProductImage,
  discontinueProductSku,
  getProduct,
  getProductEditHistory,
  getImageContentHash,
  getProductCategories,
  ProductApiError,
  removeProductImage,
  updateProduct,
  updateProductImage,
  updateProductSku,
  uploadProductImage,
  type BackendProduct,
  type ProductEditHistoryEntry,
  type ProductCategory,
  type ProductInput,
  type ProductSkuInput,
} from "./api/products";

interface EditProductPageProps {
  productId: string;
  returnTo?: "/shop/products" | "/shop/inventory";
}

type ProductStatus = BackendProduct["status"];

interface EditableSku {
  id: string;
  skuCode: string;
  variantName: string;
  price: string;
  aiCode: string;
  stock: number;
  availableStock: number;
  reservedStock: number;
  status: ProductStatus;
}

const inputClass =
  "h-10 w-full min-w-0 rounded-lg border border-outline-variant bg-surface-container-lowest px-3.5 text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-surface-container-low";
const labelClass = "mb-1.5 block text-label-md font-semibold text-on-surface";
const buttonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-label-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

const statusLabels: Record<ProductStatus, string> = {
  active: "Đang bán",
  archived: "Đã lưu trữ",
  discontinued: "Ngừng bán",
};

function toEditableSkus(product: BackendProduct): EditableSku[] {
  return product.skus.map((sku) => ({
    id: sku.id,
    skuCode: sku.skuCode,
    variantName: sku.variantName,
    price: formatStoredPrice(sku.price),
    aiCode: sku.aiCode ?? "",
    stock: sku.stock ?? (sku.availableStock ?? 0) + (sku.reservedStock ?? 0),
    availableStock: sku.availableStock ?? 0,
    reservedStock: sku.reservedStock ?? 0,
    status: sku.status,
  }));
}

function formatPriceInput(value: number | string) {
  const digits = String(value).replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("vi-VN") : "";
}

function formatStoredPrice(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  return Number.isFinite(amount) ? formatPriceInput(Math.round(amount)) : "";
}

function parsePriceInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ProductApiError) {
    if (error.status === 404) return "Không tìm thấy sản phẩm trong cửa hàng này.";
    if (error.status === 409) return "Mã sản phẩm hoặc SKU đã tồn tại. Vui lòng kiểm tra lại.";
    return error.message;
  }
  return error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.";
}

const historyFieldLabels: Record<string, string> = {
  name: "Tên sản phẩm",
  code: "Mã sản phẩm",
  description: "Mô tả",
  brand: "Thương hiệu",
  listPrice: "Giá niêm yết",
  stockWarning: "Ngưỡng cảnh báo",
  status: "Trạng thái sản phẩm",
  categoryId: "Mã danh mục",
  holdInventory: "Tự động giữ tồn kho",
  "sku.skuCode": "Mã SKU",
  "sku.variantName": "Phân loại",
  "sku.aiCode": "Mã phụ AI",
  "sku.price": "Giá Flash Live",
  "sku.status": "Trạng thái SKU",
};

function formatHistoryValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "status" || field === "sku.status") {
    return statusLabels[value as ProductStatus] ?? String(value);
  }
  if (field === "holdInventory" && typeof value === "boolean") {
    return value ? "Bật" : "Tắt";
  }
  if ((field === "listPrice" || field === "sku.price") && Number.isFinite(Number(value))) {
    return formatPriceInput(Math.round(Number(value)));
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value);
}

export function EditProductPage({ productId, returnTo = "/shop/products" }: EditProductPageProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [product, setProduct] = useState<BackendProduct | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [stockWarning, setStockWarning] = useState(0);
  const [holdInventory, setHoldInventory] = useState(true);
  const [status, setStatus] = useState<ProductStatus>("active");
  const [skus, setSkus] = useState<EditableSku[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyEntries, setHistoryEntries] = useState<ProductEditHistoryEntry[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const toggleHistory = async () => {
    const shouldExpand = !historyExpanded;
    setHistoryExpanded(shouldExpand);
    if (!shouldExpand || historyLoaded || historyLoading) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      setHistoryEntries(await getProductEditHistory(productId));
      setHistoryLoaded(true);
    } catch (historyLoadError) {
      setHistoryError(getErrorMessage(historyLoadError));
    } finally {
      setHistoryLoading(false);
    }
  };

  const applyProduct = useCallback((loadedProduct: BackendProduct) => {
    setProduct(loadedProduct);
    setName(loadedProduct.name);
    setCode(loadedProduct.code);
    setCategoryId(loadedProduct.categoryId === null ? "" : String(loadedProduct.categoryId));
    setDescription(loadedProduct.description ?? "");
    setBrand(loadedProduct.brand ?? "");
    setListPrice(formatStoredPrice(loadedProduct.listPrice));
    setStockWarning(loadedProduct.stockWarning);
    setHoldInventory(loadedProduct.holdInventory ?? true);
    setStatus(loadedProduct.status);
    setSkus(toEditableSkus(loadedProduct));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      getProduct(productId, controller.signal),
      getProductCategories(controller.signal),
    ]).then(([loadedProduct, loadedCategories]) => {
      if (controller.signal.aborted) return;
      applyProduct(loadedProduct);
      setCategories(loadedCategories);
    }).catch((loadError: unknown) => {
      if (!controller.signal.aborted) setError(getErrorMessage(loadError));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [applyProduct, productId]);

  const updateSkuField = (index: number, field: keyof EditableSku, value: string | number) => {
    setSkus((current) =>
      current.map((sku, skuIndex) =>
        skuIndex === index
          ? {
              ...sku,
              [field]: field === "status" ? value as ProductStatus : field === "stock" ? Number(value) : value,
              ...(field === "stock"
                ? { availableStock: Math.max(Number(value) - sku.reservedStock, 0) }
                : {}),
            }
          : sku
      )
    );
  };

  const saveChanges = async () => {
    if (!product) return;
    setError("");
    setNotice("");
    if (!name.trim() || !code.trim()) {
      setError("Tên và mã sản phẩm là bắt buộc.");
      return;
    }
    const activeSkus = skus.filter((sku) => sku.status !== "discontinued");
    if (activeSkus.some((sku) => !sku.skuCode.trim() || !sku.variantName.trim())) {
      setError("Mỗi SKU cần có mã SKU và tên phân loại.");
      return;
    }
    const skuCodes = activeSkus.map((sku) => sku.skuCode.trim().toLowerCase());
    if (new Set(skuCodes).size !== skuCodes.length) {
      setError("Mã SKU không được trùng nhau.");
      return;
    }
    if (activeSkus.some((sku) => !Number.isFinite(parsePriceInput(sku.price)) || parsePriceInput(sku.price) < 0)) {
      setError("Giá SKU phải là số lớn hơn hoặc bằng 0.");
      return;
    }
    const parsedListPrice = listPrice ? parsePriceInput(listPrice) : null;
    const productInput: ProductInput = {
      name: name.trim(),
      code: code.trim(),
      categoryId: categoryId ? Number(categoryId) : null,
      description: description.trim() || null,
      brand: brand.trim() || null,
      listPrice: parsedListPrice && parsedListPrice > 0 ? parsedListPrice : null,
      stockWarning: stockWarning >= 0 ? stockWarning : 0,
      triggerCode: code.trim() || null,
      shippingWeightGrams: product.shippingWeightGrams && product.shippingWeightGrams > 0 ? Math.round(product.shippingWeightGrams) : null,
      packageLengthCm: product.packageLengthCm && Number(product.packageLengthCm) > 0 ? Number(product.packageLengthCm) : null,
      packageWidthCm: product.packageWidthCm && Number(product.packageWidthCm) > 0 ? Number(product.packageWidthCm) : null,
      packageHeightCm: product.packageHeightCm && Number(product.packageHeightCm) > 0 ? Number(product.packageHeightCm) : null,
      holdInventory,
      status,
    };
    setSaving(true);
    try {
      await updateProduct(productId, productInput);
      await Promise.all(skus.map(async (sku) => {
        const input: ProductSkuInput = {
          skuCode: sku.skuCode.trim(),
          variantName: sku.variantName.trim(),
          price: parsePriceInput(sku.price),
          aiCode: sku.aiCode.trim() || null,
          stock: sku.stock,
          status: sku.status,
        };
        if (sku.status === "discontinued" && product.skus.find((item) => item.id === sku.id)?.status !== "discontinued") {
          await discontinueProductSku(productId, sku.id);
        } else if (sku.status !== "discontinued") {
          await updateProductSku(productId, sku.id, input);
        }
      }));
      router.push(returnTo);
    } catch (saveError) {
      setError(`Không thể lưu đầy đủ thay đổi: ${getErrorMessage(saveError)}. Tải lại dữ liệu để kiểm tra trạng thái đã cập nhật.`);
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || !product) return;
    const selected = Array.from(files);
    const invalidFile = selected.find((file) =>
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024
    );
    if (invalidFile) {
      setError("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP có dung lượng tối đa 5MB.");
      return;
    }

    let fingerprinted: { file: File; contentHash: string }[];
    try {
      fingerprinted = await Promise.all(
        selected.map(async (file) => ({ file, contentHash: await getImageContentHash(file) }))
      );
    } catch (hashError) {
      setError(
        hashError instanceof Error
          ? `Không thể kiểm tra ảnh: ${hashError.message}`
          : "Không thể kiểm tra ảnh đã chọn."
      );
      return;
    }
    const seen = new Set(product.images.map((image) => image.contentHash).filter(
      (hash): hash is string => Boolean(hash)
    ));
    let duplicateFound = false;
    const unique = fingerprinted.filter(({ contentHash }) => {
      if (seen.has(contentHash)) {
        duplicateFound = true;
        return false;
      }
      seen.add(contentHash);
      return true;
    });
    if (product.images.length + unique.length > 8) {
      setError("Mỗi sản phẩm có thể có tối đa 8 ảnh.");
      return;
    }
    if (duplicateFound && unique.length === 0) {
      setError("Ảnh sản phẩm không được trùng nhau.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    setError(duplicateFound ? "Ảnh sản phẩm không được trùng nhau." : "");
    try {
      let primaryImageAdded = product.images.length > 0;
      let nextSortOrder = product.images.length;
      for (const { file, contentHash } of unique) {
        const imageUrl = await uploadProductImage(file);
        const isPrimary = !primaryImageAdded;
        const image = await createProductImage(productId, {
          url: imageUrl,
          contentHash,
          isPrimary,
          sortOrder: nextSortOrder,
        });
        primaryImageAdded = true;
        nextSortOrder += 1;
        setProduct((current) => current ? { ...current, images: [...current.images, image] } : current);
      }
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const setPrimaryImage = async (imageId: string) => {
    try {
      const image = await updateProductImage(productId, imageId, { isPrimary: true });
      setProduct((current) => current ? {
        ...current,
        images: current.images.map((item) => ({ ...item, isPrimary: item.id === image.id })),
      } : current);
      setError("");
    } catch (imageError) {
      setError(getErrorMessage(imageError));
    }
  };

  const deleteImage = async (imageId: string) => {
    try {
      await removeProductImage(productId, imageId);
      const refreshed = await getProduct(productId);
      setProduct(refreshed);
      setError("");
    } catch (imageError) {
      setError(getErrorMessage(imageError));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-3 text-on-surface-variant" role="status">
        <LoaderCircle className="animate-spin" size={20} aria-hidden="true" />
        Đang tải thông tin sản phẩm...
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-outline-variant bg-white p-6">
        <div className="flex items-start gap-3 text-error" role="alert">
          <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
          <p>{error || "Không thể tải sản phẩm."}</p>
        </div>
        <Link className="mt-4 inline-flex text-label-md font-semibold text-primary hover:underline" href="/shop/products">
          Quay lại danh sách sản phẩm
        </Link>
      </div>
    );
  }

  const activeSkus = skus.filter((sku) => sku.status === "active");
  const totalStock = activeSkus.reduce((total, sku) => total + sku.stock, 0);
  const availableStock = activeSkus.reduce((total, sku) => total + sku.availableStock, 0);
  const reservedStock = activeSkus.reduce((total, sku) => total + sku.reservedStock, 0);
  const activeSkuPrices = activeSkus.map((sku) => parsePriceInput(sku.price));
  const livePrice =
    activeSkuPrices.length > 0 && activeSkuPrices.every((price) => price === activeSkuPrices[0])
      ? formatPriceInput(activeSkuPrices[0])
      : "";

  return (
    <div className="min-w-0">
      <div className="sticky top-16 z-20 -mx-4 mb-6 border-b border-outline-variant bg-surface-container-lowest/95 px-4 py-4 shadow-sm backdrop-blur md:-mx-6 md:px-6">
        <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1.5 text-label-sm text-on-surface-variant">
              <Link className="hover:text-primary" href="/shop/products">Sản phẩm</Link>
              <ChevronRight size={14} aria-hidden="true" />
              <Link className="hover:text-primary" href="/shop/products">Quản lý sản phẩm</Link>
              <ChevronRight size={14} aria-hidden="true" />
              <span className="font-semibold text-on-surface">{product.code}</span>
            </nav>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">Chỉnh sửa sản phẩm</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-label-sm font-semibold ${
                status === "active"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : status === "archived"
                    ? "border-outline-variant bg-surface-container-low text-on-surface-variant"
                    : "border-amber-200 bg-amber-50 text-amber-800"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status === "active" ? "bg-emerald-600" : status === "archived" ? "bg-outline" : "bg-amber-600"}`} />
                {statusLabels[status]}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={`${buttonClass} border border-outline-variant bg-white text-on-surface hover:bg-surface-container-low`}
              type="button"
              onClick={() => router.push(returnTo)}
              disabled={saving || uploading}
            >
              <X size={16} aria-hidden="true" /> Hủy
            </button>
            <Link
              className={`${buttonClass} border border-primary/20 bg-surface-container-low text-primary hover:bg-surface-container`}
              href="/shop/livestream"
            >
              <Eye size={16} aria-hidden="true" /> Xem trên Livestream
            </Link>
            <button
              className={`${buttonClass} bg-primary-container text-on-primary shadow-sm hover:bg-primary`}
              type="button"
              onClick={() => void saveChanges()}
              disabled={saving || uploading}
            >
              {saving ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
              {saving ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-8">
          <Card className="!p-4 md:!p-6">
            <div className="mb-5 flex items-center justify-between gap-3 border-b border-outline-variant pb-4">
              <div className="flex min-w-0 items-center gap-2">
                <Info size={20} className="block w-5 shrink-0 -translate-y-1.5 text-primary" aria-hidden="true" />
                <h2 className="font-title-sm text-title-sm font-semibold">Thông tin chung</h2>
              </div>
              <span className="rounded bg-surface-container-low px-2 py-0.5 text-label-sm text-on-surface-variant">
                Mã chốt đơn: {code}
              </span>
            </div>
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className={labelClass} htmlFor="product-name">Tên sản phẩm <span className="text-error">*</span></label>
                  <span className="text-label-sm text-on-surface-variant">{name.length} / 120 ký tự</span>
                </div>
                <input id="product-name" className={inputClass} disabled={saving || uploading} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="product-category">Danh mục hàng hóa <span className="text-error">*</span></label>
                  <select id="product-category" className={inputClass} disabled={saving || uploading} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                    <option value="">Chưa phân loại</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="product-brand">Thương hiệu / Nhãn hiệu</label>
                  <input id="product-brand" className={inputClass} disabled={saving || uploading} maxLength={150} placeholder="Nhập thương hiệu hoặc OEM..." value={brand} onChange={(event) => setBrand(event.target.value)} />
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor="product-description">Mô tả chi tiết</label>
                <textarea
                  id="product-description"
                  className="min-h-36 w-full resize-y rounded-lg border border-outline-variant bg-white p-3.5 text-body-md leading-relaxed text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  disabled={saving || uploading}
                  maxLength={10000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </div>
          </Card>

          <Card className="!p-4 md:!p-6">
            <div className="mb-5 flex items-center justify-between gap-3 border-b border-outline-variant pb-4">
              <div className="flex min-w-0 items-center gap-2">
                <CreditCard size={20} className="block w-5 shrink-0 -translate-y-1.5 text-primary" aria-hidden="true" />
                <h2 className="font-title-sm text-title-sm font-semibold">Giá bán &amp; Tồn kho WMS</h2>
              </div>
              {product.isPinned && (
                <span className="inline-flex items-center gap-1 rounded bg-secondary-fixed px-2.5 py-1 text-label-sm font-semibold text-on-secondary-fixed">
                  <Radio size={14} aria-hidden="true" /> Đang áp dụng phiên Live
                </span>
              )}
            </div>
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-outline-variant/60 bg-surface-container-low p-4">
                <label className="mb-1 block text-label-md text-on-surface-variant" htmlFor="product-list-price">Giá niêm yết (VND)</label>
                <input
                  id="product-list-price"
                  className={`${inputClass} bg-white font-semibold`}
                  disabled={saving || uploading}
                  inputMode="numeric"
                  placeholder="0"
                  value={listPrice}
                  onChange={(event) => setListPrice(formatPriceInput(event.target.value))}
                />
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary-fixed/20 p-4">
                <label className="mb-1 block text-label-md font-semibold text-primary" htmlFor="product-live-price">Giá Flash Live (VND) <span className="text-error">*</span></label>
                <input
                  id="product-live-price"
                  aria-label="Giá Flash Live (VND) *"
                  className={`${inputClass} bg-white font-mono font-semibold`}
                  disabled={saving || uploading || activeSkus.length === 0}
                  inputMode="numeric"
                  placeholder={livePrice ? undefined : "Giá giữa các SKU khác nhau"}
                  value={livePrice}
                  onChange={(event) => {
                    const nextPrice = formatPriceInput(event.target.value);
                    setSkus((current) => current.map((sku) =>
                      sku.status === "active" ? { ...sku, price: nextPrice } : sku
                    ));
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Tổng tồn kho nhập", value: totalStock, sub: `Phân bổ ${activeSkus.length} biến thể`, style: "border-outline-variant bg-white text-on-surface-variant" },
                { label: "Tồn khả dụng", value: availableStock, sub: "Sẵn sàng chốt đơn", style: "border-emerald-200 bg-emerald-50 text-emerald-800" },
                { label: "Đang giữ", value: reservedStock, sub: "Đang giữ trong giỏ", style: "border-amber-200 bg-amber-50 text-amber-900" },
                { label: "Ngưỡng cảnh báo", value: stockWarning, sub: "Thông báo khi tồn thấp", style: "border-error-container bg-error-container/40 text-on-error-container" },
              ].map((metric) => (
                <div className={`rounded-lg border p-3.5 ${metric.style}`} key={metric.label}>
                  <span className="mb-1 block text-label-sm">{metric.label}</span>
                  <span className="font-metric-num text-metric-num">{metric.value}</span>
                  <span className="mt-1 block text-[11px]">{metric.sub}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="!p-4 md:!p-6">
            <div className="mb-5 flex items-center justify-between gap-3 border-b border-outline-variant pb-4">
              <div className="flex min-w-0 items-stretch gap-2">
                <span className="flex w-5 shrink-0 items-center justify-center">
                  <Bot size={20} className="block text-secondary" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col justify-center">
                  <h2 className="m-0 font-title-sm text-title-sm font-semibold leading-6">Thiết lập Mã Chốt Đơn AI</h2>
                  <p className="m-0 text-body-sm leading-5 text-on-surface-variant">Mã kích hoạt nhận diện bình luận livestream</p>
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-label-sm font-semibold ${code.trim() ? "bg-emerald-100 text-emerald-800" : "bg-surface-container-low text-on-surface-variant"}`}>
                {code.trim() ? "Đã thiết lập" : "Chưa thiết lập"}
              </span>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelClass} htmlFor="product-code">Mã chốt đơn chính (Keyword Code) <span className="text-error">*</span></label>
                  <p id="product-code" className="font-mono font-semibold text-on-surface" aria-label="Mã chốt đơn chính (Keyword Code) *" title={code}>{code}</p>
                  <p className="mt-1 text-label-sm text-on-surface-variant">Mã này được dùng để AI nhận diện bình luận chốt đơn.</p>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Trạng thái nhận diện</label>
                  <div className="box-border flex h-10 min-h-10 items-center justify-between rounded-lg border border-outline-variant/60 bg-surface-container-low px-3.5">
                    <span className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                      <Check size={16} className="text-primary" aria-hidden="true" />
                      Mã chốt đơn chính sẽ được dùng bởi bộ nhận diện hiện tại
                    </span>
                    <span className="text-label-sm font-semibold text-primary">{code.trim() ? "Đã cấu hình" : "Chờ cấu hình"}</span>
                  </div>
                </div>
              </div>
              <div>
                <p className={labelClass}>Ví dụ cú pháp bình luận</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {[
                    { title: "Mã + số lượng", example: `${code || "MÃ SP"} 2 cái`, detail: "Khớp mã chốt đơn chính và số lượng" },
                    { title: "Khẩu ngữ mua hàng", example: `Lấy 1 cái ${code || "MÃ SP"} nha`, detail: "Nhận diện câu mua hàng tự nhiên" },
                    { title: "Đầy đủ tham số", example: `${code || "MÃ SP"} phân loại số điện thoại`, detail: "Đối chiếu SKU và thông tin khách" },
                  ].map((sample) => (
                    <div className="rounded-lg border border-outline-variant/60 bg-surface-container-low p-3" key={sample.title}>
                      <span className="mb-1 block text-label-sm font-semibold text-primary">{sample.title}</span>
                      <p className="rounded border border-outline-variant/40 bg-white p-2 font-mono text-xs text-on-surface">“{sample.example}”</p>
                      <span className="mt-1.5 block text-[11px] text-on-surface-variant">{sample.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-outline-variant/80 bg-surface-container-low p-3.5 transition-colors hover:bg-surface-container">
                <input
                  aria-label="Tự động giữ tồn kho 15 phút"
                  className={`${styles.editInlineCheckbox} accent-primary`}
                  type="checkbox"
                  checked={holdInventory}
                  disabled={saving || uploading}
                  onChange={(event) => setHoldInventory(event.target.checked)}
                />
                <span className="min-w-0 flex-1">
                  <strong className="text-label-md">Tự động giữ tồn kho 15 phút</strong>
                  <span className="mt-0.5 block text-[11px] leading-snug text-on-surface-variant">Giữ hàng khi nhận bình luận hợp lệ để khách hoàn tất thông tin đặt hàng.</span>
                </span>
                <span className="text-label-sm font-semibold text-secondary">Khuyến nghị</span>
              </label>
            </div>
          </Card>

          <Card className="!p-4 md:!p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant pb-4">
              <div className="flex min-w-0 items-stretch gap-2">
                <span className="flex w-5 shrink-0 items-center justify-center">
                  <Layers size={20} className="block text-primary" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col justify-center">
                  <h2 className="m-0 font-title-sm text-title-sm font-semibold leading-6">Bảng cấu hình biến thể &amp; SKU riêng</h2>
                  <p className="m-0 text-body-sm leading-5 text-on-surface-variant">{activeSkus.length} SKU đang hoạt động, đồng bộ với kho và livestream.</p>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-outline-variant">
              <table className="w-full min-w-[1050px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container-low text-[11px] uppercase tracking-wider text-outline">
                    <th className="whitespace-nowrap px-3 py-2.5">Phân loại</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Mã SKU</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Mã phụ AI</th>
                    <th className="w-[7rem] min-w-[7rem] max-w-[7rem] whitespace-nowrap px-3 py-2.5 text-right">Tổng tồn</th>
                    <th className="w-[7rem] min-w-[7rem] max-w-[7rem] whitespace-nowrap px-3 py-2.5 text-right">Khả dụng</th>
                    <th className="w-[7rem] min-w-[7rem] max-w-[7rem] whitespace-nowrap px-3 py-2.5 text-right">Đang giữ</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Ngưỡng cảnh báo</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Giá Flash Live (VND)</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center">Trạng thái</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/60 text-body-sm">
                  {skus.length === 0 ? (
                    <tr>
                      <td className="bg-surface-container-low p-4 text-body-sm text-on-surface-variant" colSpan={6}>
                        Sản phẩm chưa có biến thể nào.
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          id="stock-warning"
                          aria-label="Ngưỡng cảnh báo SKU chưa có"
                          className={`${styles.editSkuTableControl} ${styles.editStockWarningInput} h-9 rounded-md border border-outline-variant bg-white px-2 text-right font-medium text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-surface-container-low`}
                          disabled={saving || uploading}
                          type="number"
                          min="0"
                          title="Ngưỡng cảnh báo. Thông báo khi tồn kho thấp hơn mức này."
                          value={stockWarning}
                          onChange={(event) => setStockWarning(Number(event.target.value))}
                        />
                      </td>
                      <td colSpan={3} />
                    </tr>
                  ) : skus.map((sku, index) => (
                    <tr className="transition-colors hover:bg-surface-container-low/60" key={sku.id ?? `new-${index}`}>
                      <td className="min-w-40 px-3 py-3">
                        <span aria-label={`Phân loại SKU ${index + 1}`} className="block max-w-32 truncate whitespace-nowrap font-semibold text-on-surface" title={sku.variantName}>{sku.variantName}</span>
                      </td>
                      <td className="min-w-36 px-3 py-3">
                        <span aria-label={`Mã SKU ${index + 1}`} className="block max-w-36 truncate whitespace-nowrap font-mono text-xs text-on-surface-variant" title={sku.skuCode}>{sku.skuCode}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span aria-label={`Mã phụ AI ${index + 1}`} className={`${styles.editSkuAiCodeInput} block truncate whitespace-nowrap font-mono text-xs font-bold text-primary`} title={sku.aiCode || undefined}>{sku.aiCode || "—"}</span>
                      </td>
                      <td className="w-[7rem] min-w-[7rem] max-w-[7rem] whitespace-nowrap px-3 py-3 text-right font-medium text-on-surface">{sku.stock}</td>
                      <td className="w-[7rem] min-w-[7rem] max-w-[7rem] whitespace-nowrap px-3 py-3 text-right font-semibold text-emerald-700">{sku.availableStock}</td>
                      <td className="w-[7rem] min-w-[7rem] max-w-[7rem] whitespace-nowrap px-3 py-3 text-right text-amber-700">{sku.reservedStock}</td>
                      <td className="px-3 py-3 text-right">
                        <input
                          aria-label={`Ngưỡng cảnh báo SKU ${index + 1}`}
                          className={`${styles.editSkuTableControl} ${styles.editStockWarningInput} h-9 rounded-md border border-outline-variant bg-white px-2 text-right font-medium text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-surface-container-low`}
                          disabled={saving || uploading}
                          type="number"
                          min="0"
                          title={`Ngưỡng cảnh báo: ${stockWarning}. Thông báo khi tồn kho thấp hơn mức này.`}
                          value={stockWarning}
                          onChange={(event) => setStockWarning(Number(event.target.value))}
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span aria-label={`Giá Flash Live SKU ${index + 1}`} className="block truncate whitespace-nowrap text-right font-bold text-on-surface" title={sku.price}>{sku.price}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <select aria-label={`Trạng thái SKU ${index + 1}`} className={`${styles.editSkuTableControl} ${styles.editSkuStatusSelect} h-8 truncate whitespace-nowrap rounded-full border border-outline-variant bg-white px-2 text-[11px] font-semibold text-on-surface`} disabled={saving || uploading || status === "discontinued"} title={status === "discontinued" ? "Sản phẩm đang ngừng bán; trạng thái riêng của SKU sẽ được giữ lại." : statusLabels[sku.status]} value={status === "discontinued" ? "discontinued" : sku.status} onChange={(event) => updateSkuField(index, "status", event.target.value)}>
                          <option value="active">Đang bán</option>
                          <option value="archived">Đã lưu trữ</option>
                          <option value="discontinued">Ngừng bán</option>
                        </select>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          aria-label={`Ngừng bán SKU ${sku.skuCode}`}
                          className="rounded p-1 text-on-surface-variant transition-colors hover:bg-rose-50 hover:text-rose-700"
                          type="button"
                          disabled={saving || uploading}
                          onClick={() => updateSkuField(index, "status", "discontinued")}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 xl:col-span-4">
          <Card className="!p-4 md:!p-5">
            <h2 className="mb-3 flex items-center gap-2 font-title-sm text-title-sm font-semibold">
              <ToggleRight size={20} className="block w-5 shrink-0 text-primary" aria-hidden="true" /> Trạng thái bán hàng
            </h2>
            <div className="space-y-2">
              {(["active", "archived", "discontinued"] as const).map((value) => (
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${status === value ? "border-2 border-primary bg-primary-fixed/10" : "border-outline-variant hover:bg-surface-container-low"}`}
                  key={value}
                >
                  <input className={`${styles.editStatusRadio} accent-primary`} type="radio" name="product-status" checked={status === value} disabled={saving || uploading} onChange={() => setStatus(value)} />
                  <span className="min-w-0 flex-1">
                    <strong className="text-label-md">{statusLabels[value]}</strong>
                    <span className="mt-0.5 block text-[11px] leading-snug text-on-surface-variant">
                      {value === "active"
                        ? "Hiển thị trong giỏ livestream và cho phép chốt đơn."
                        : value === "archived"
                          ? "Sản phẩm hết tồn hoặc đã được lưu trữ."
                          : "Khóa mã chốt đơn và ẩn khỏi catalog."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Card>

          <Card className="!p-4 md:!p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-title-sm text-title-sm font-semibold">
                <ImagePlus size={20} className="block w-5 shrink-0 text-primary" aria-hidden="true" /> Hình ảnh sản phẩm ({product.images.length}/8)
              </h2>
              <span className="text-label-sm text-on-surface-variant">Tối đa 5MB / ảnh</span>
            </div>
            {product.images.length > 0 && (
              <div className="mb-3 grid grid-cols-3 gap-2.5">
                {product.images.map((image) => (
                  <div className="group relative aspect-square overflow-hidden rounded-lg border border-outline-variant bg-surface-container" key={image.id}>
                    <Image fill unoptimized sizes="(max-width: 1280px) 45vw, 15vw" className="object-cover" src={image.url} alt={`Ảnh sản phẩm ${product.name}`} />
                    {image.isPrimary && <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-inverse-surface/85 px-1.5 py-1 text-[10px] font-semibold text-white"><Star size={11} fill="currentColor" /> Ảnh đại diện</span>}
                    <div className="absolute inset-0 flex items-center justify-center gap-1 bg-inverse-surface/40 opacity-0 transition-opacity group-hover:opacity-100">
                      {!image.isPrimary && (
                        <button aria-label="Đặt làm ảnh đại diện" className="rounded bg-white p-1.5 text-primary shadow hover:bg-slate-100" type="button" disabled={saving || uploading} onClick={() => void setPrimaryImage(image.id)}>
                          <Star size={14} aria-hidden="true" />
                        </button>
                      )}
                      <button aria-label="Xóa ảnh" className="rounded bg-white p-1.5 text-error shadow hover:bg-slate-100" type="button" disabled={saving || uploading} onClick={() => void deleteImage(image.id)}>
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {product.images.length < 8 && (
              <button
                className="flex min-h-24 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-outline-variant px-4 py-4 text-center transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || saving}
              >
                {uploading ? <LoaderCircle className="mb-1 animate-spin text-primary" size={25} aria-hidden="true" /> : <Upload className="mb-1 text-primary" size={25} aria-hidden="true" />}
                <span className="text-label-md font-semibold">{uploading ? "Đang tải ảnh..." : "Tải thêm hình ảnh hoặc kéo thả"}</span>
                <span className="mt-0.5 text-[11px] text-on-surface-variant">JPG, PNG, WEBP (khuyên dùng tỷ lệ 1:1)</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              multiple
              type="file"
              onChange={(event) => void handleImageUpload(event.target.files)}
            />
            <p className="mt-3 flex items-start gap-2 text-label-sm text-on-surface-variant">
              <Check className="mt-0.5 shrink-0 text-primary" size={14} aria-hidden="true" />
              Ảnh đầu tiên sẽ tự động được chọn làm ảnh đại diện.
            </p>
          </Card>

          <Card className="!p-4 md:!p-5">
            <h2 className="mb-3 flex items-center gap-2 font-title-sm text-title-sm font-semibold">
              <History size={20} className="block w-5 shrink-0 text-primary" aria-hidden="true" />
              Lịch sử chỉnh sửa &amp; thông tin hệ thống
            </h2>
            <dl className="space-y-2 text-body-sm">
              <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Mã chốt đơn chính</dt><dd className="font-mono font-semibold">{code}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Ngày tạo</dt><dd>{new Date(product.createdAt).toLocaleDateString("vi-VN")}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Cập nhật lần cuối</dt><dd>{new Date(product.updatedAt).toLocaleDateString("vi-VN")}</dd></div>
            </dl>
            <button
              aria-expanded={historyExpanded}
              className="mt-4 inline-flex items-center gap-1.5 text-label-md font-semibold text-primary hover:underline disabled:cursor-wait disabled:opacity-60"
              type="button"
              disabled={historyLoading}
              onClick={() => void toggleHistory()}
            >
              {historyExpanded ? <ChevronDown size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
              {historyLoading ? "Đang tải lịch sử..." : "Xem chi tiết lịch sử"}
            </button>
            {historyExpanded && (
              <div className="mt-3 border-t border-outline-variant pt-3" aria-live="polite">
                {historyError ? (
                  <p className="text-body-sm text-error" role="alert">{historyError}</p>
                ) : historyLoading ? (
                  <p className="text-body-sm text-on-surface-variant">Đang tải lịch sử chỉnh sửa...</p>
                ) : historyEntries.length === 0 ? (
                  <p className="text-body-sm text-on-surface-variant">Chưa có lịch sử chỉnh sửa được ghi nhận.</p>
                ) : (
                  <ol className="space-y-4">
                    {historyEntries.map((entry) => (
                      <li className="border-l-2 border-primary/30 pl-3" key={entry.id}>
                        <p className="text-label-md font-semibold text-on-surface">{entry.summary}</p>
                        <time className="mt-0.5 block text-label-sm text-on-surface-variant" dateTime={entry.createdAt}>
                          {new Date(entry.createdAt).toLocaleString("vi-VN")}
                        </time>
                        <ul className="mt-2 space-y-1.5 text-body-sm">
                          {Object.entries(entry.changes).map(([field, change]) => (
                            <li className="break-words" key={field}>
                              <span className="font-medium">{historyFieldLabels[field] ?? field}</span>
                              {": "}
                              <span>{formatHistoryValue(field, change.from)}</span>
                              {" → "}
                              <span>{formatHistoryValue(field, change.to)}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </Card>
        </aside>
      </div>

      {(error || notice) && (
        <div aria-live="polite" className={`fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2.5rem)] items-start gap-3 rounded-lg px-4 py-3 shadow-xl ${error ? "bg-rose-50 text-rose-900 ring-1 ring-rose-200" : "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"}`} role={error ? "alert" : "status"}>
          {error ? <AlertCircle className="mt-0.5 shrink-0" size={19} aria-hidden="true" /> : <Check className="mt-0.5 shrink-0" size={19} aria-hidden="true" />}
          <div className="min-w-0 flex-1 text-body-sm">{error || notice}</div>
          <button aria-label="Đóng thông báo" className="shrink-0 opacity-70 hover:opacity-100" type="button" onClick={() => { setError(""); setNotice(""); }}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
