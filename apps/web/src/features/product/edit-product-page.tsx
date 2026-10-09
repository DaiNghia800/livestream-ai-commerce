"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  ChevronRight,
  ImagePlus,
  Info,
  LoaderCircle,
  Package,
  Plus,
  Save,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import styles from "./product.module.css";
import {
  createProductImage,
  createProductSku,
  discontinueProductSku,
  getProduct,
  getProductCategories,
  ProductApiError,
  removeProductImage,
  updateProduct,
  updateProductImage,
  updateProductSku,
  uploadProductImage,
  type BackendProduct,
  type ProductCategory,
  type ProductInput,
  type ProductSkuInput,
} from "./api/products";

interface EditProductPageProps {
  productId: string;
}

type ProductStatus = BackendProduct["status"];

interface EditableSku {
  id: string | null;
  skuCode: string;
  variantName: string;
  price: string;
  aiCode: string;
  stock: number;
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
  discontinued: "Ngừng kinh doanh",
};

function toEditableSkus(product: BackendProduct): EditableSku[] {
  return product.skus.map((sku) => ({
    id: sku.id,
    skuCode: sku.skuCode,
    variantName: sku.variantName,
    price: sku.price,
    aiCode: sku.aiCode ?? "",
    stock: sku.stock,
    status: sku.status,
  }));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ProductApiError) {
    if (error.status === 404) return "Không tìm thấy sản phẩm trong cửa hàng này.";
    if (error.status === 409) return "Mã sản phẩm hoặc SKU đã tồn tại. Vui lòng kiểm tra lại.";
    return error.message;
  }
  return error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.";
}

export function EditProductPage({ productId }: EditProductPageProps) {
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
  const [triggerCode, setTriggerCode] = useState("");
  const [holdInventory, setHoldInventory] = useState(true);
  const [shippingWeightGrams, setShippingWeightGrams] = useState<number | "">("");
  const [packageLengthCm, setPackageLengthCm] = useState<number | "">("");
  const [packageWidthCm, setPackageWidthCm] = useState<number | "">("");
  const [packageHeightCm, setPackageHeightCm] = useState<number | "">("");
  const [status, setStatus] = useState<ProductStatus>("active");
  const [skus, setSkus] = useState<EditableSku[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const applyProduct = useCallback((loadedProduct: BackendProduct) => {
    setProduct(loadedProduct);
    setName(loadedProduct.name);
    setCode(loadedProduct.code);
    setCategoryId(loadedProduct.categoryId === null ? "" : String(loadedProduct.categoryId));
    setDescription(loadedProduct.description ?? "");
    setBrand(loadedProduct.brand ?? "");
    setListPrice(loadedProduct.listPrice ?? "");
    setStockWarning(loadedProduct.stockWarning);
    setTriggerCode(loadedProduct.triggerCode ?? "");
    setShippingWeightGrams(loadedProduct.shippingWeightGrams ?? "");
    setPackageLengthCm(loadedProduct.packageLengthCm ? Number(loadedProduct.packageLengthCm) : "");
    setPackageWidthCm(loadedProduct.packageWidthCm ? Number(loadedProduct.packageWidthCm) : "");
    setPackageHeightCm(loadedProduct.packageHeightCm ? Number(loadedProduct.packageHeightCm) : "");
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
        skuIndex === index ? { ...sku, [field]: field === "status" ? value as ProductStatus : field === "stock" ? Number(value) : value } : sku
      )
    );
  };

  const addSku = () => {
    setSkus((current) => [
      ...current,
      { id: null, skuCode: "", variantName: "", price: "0", aiCode: "", stock: 0, status: "active" },
    ]);
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
    if (activeSkus.some((sku) => !Number.isFinite(Number(sku.price)) || Number(sku.price) < 0)) {
      setError("Giá SKU phải là số lớn hơn hoặc bằng 0.");
      return;
    }

    const parsedListPrice = listPrice ? Number(String(listPrice).replace(/[^\d.]/g, "")) : null;
    const productInput: ProductInput = {
      name: name.trim(),
      code: code.trim(),
      categoryId: categoryId ? Number(categoryId) : null,
      description: description.trim() || null,
      brand: brand.trim() || null,
      listPrice: parsedListPrice && parsedListPrice > 0 ? parsedListPrice : null,
      stockWarning: stockWarning >= 0 ? stockWarning : 0,
      triggerCode: triggerCode.trim() || null,
      shippingWeightGrams: shippingWeightGrams !== "" && Number(shippingWeightGrams) > 0 ? Math.round(Number(shippingWeightGrams)) : null,
      packageLengthCm: packageLengthCm !== "" && Number(packageLengthCm) > 0 ? Number(packageLengthCm) : null,
      packageWidthCm: packageWidthCm !== "" && Number(packageWidthCm) > 0 ? Number(packageWidthCm) : null,
      packageHeightCm: packageHeightCm !== "" && Number(packageHeightCm) > 0 ? Number(packageHeightCm) : null,
      status,
    };
    setSaving(true);
    try {
      await updateProduct(productId, productInput);
      await Promise.all(skus.map(async (sku) => {
        const input: ProductSkuInput = {
          skuCode: sku.skuCode.trim(),
          variantName: sku.variantName.trim(),
          price: Number(sku.price),
          aiCode: sku.aiCode.trim() || null,
          stock: sku.stock,
          status: sku.status,
        };
        if (!sku.id) {
          if (sku.status !== "discontinued") await createProductSku(productId, input);
        } else if (sku.status === "discontinued" && product.skus.find((item) => item.id === sku.id)?.status !== "discontinued") {
          await discontinueProductSku(productId, sku.id);
        } else if (sku.status !== "discontinued") {
          await updateProductSku(productId, sku.id, input);
        }
      }));
      router.push("/shop/products");
    } catch (saveError) {
      setError(`Không thể lưu đầy đủ thay đổi: ${getErrorMessage(saveError)}. Tải lại dữ liệu để kiểm tra trạng thái đã cập nhật.`);
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || !product) return;
    const selected = Array.from(files);
    if (selected.length + product.images.length > 8) {
      setError("Mỗi sản phẩm có thể có tối đa 8 ảnh.");
      return;
    }
    const invalidFile = selected.find((file) =>
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024
    );
    if (invalidFile) {
      setError("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP có dung lượng tối đa 5MB.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      let primaryImageAdded = product.images.length > 0;
      let nextSortOrder = product.images.length;
      for (const file of selected) {
        const imageUrl = await uploadProductImage(file);
        const isPrimary = !primaryImageAdded;
        const image = await createProductImage(productId, {
          url: imageUrl,
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

  return (
    <div className="min-w-0">
      <div className="sticky top-0 z-10 -mx-4 mb-5 border-b border-outline-variant bg-surface-container-lowest/95 px-4 py-4 shadow-sm backdrop-blur md:-mx-8 md:px-8">
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
              <span className="rounded-full border border-outline-variant bg-surface-container-low px-2.5 py-0.5 text-label-sm font-semibold text-on-surface-variant">
                {statusLabels[status]}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={`${buttonClass} border border-outline-variant bg-white text-on-surface hover:bg-surface-container-low`}
              type="button"
              onClick={() => router.push("/shop/products")}
              disabled={saving || uploading}
            >
              <X size={16} aria-hidden="true" /> Hủy
            </button>
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

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-5 xl:col-span-8">
          {/* 1. Thông tin sản phẩm */}
          <Card className="!p-4 md:!p-6">
            <div className="mb-5 flex items-center gap-2 border-b border-outline-variant pb-4">
              <Info size={20} className="text-primary" aria-hidden="true" />
              <h2 className="font-title-sm text-title-sm font-semibold">1. Thông tin sản phẩm</h2>
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
                  <label className={labelClass} htmlFor="product-code">Mã sản phẩm <span className="text-error">*</span></label>
                  <input id="product-code" className={inputClass} disabled={saving || uploading} maxLength={50} value={code} onChange={(event) => setCode(event.target.value)} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="product-category">Danh mục</label>
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
                  <label className={labelClass} htmlFor="product-brand">Thương hiệu</label>
                  <input id="product-brand" className={inputClass} disabled={saving || uploading} maxLength={150} placeholder="Nhập thương hiệu hoặc OEM..." value={brand} onChange={(event) => setBrand(event.target.value)} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="product-list-price">Giá niêm yết (VND)</label>
                  <input id="product-list-price" className={inputClass} disabled={saving || uploading} type="number" min="0" placeholder="0" value={listPrice} onChange={(event) => setListPrice(event.target.value)} />
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

          {/* 2. Mã chốt đơn AI */}
          <Card className="!p-4 md:!p-6">
            <div className="mb-5 flex items-center gap-2 border-b border-outline-variant pb-4">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: "20px" }}>smart_toy</span>
              <h2 className="font-title-sm text-title-sm font-semibold">2. Mã chốt đơn AI &amp; Tồn kho</h2>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="trigger-code">Mã chốt đơn AI (Trigger Code)</label>
                  <div className="flex h-9 items-center rounded-lg border border-outline-variant bg-surface-container-lowest transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                    <span className="select-none px-2.5 text-label-md font-bold text-primary">#</span>
                    <input
                      id="trigger-code"
                      className={`${styles.editTriggerCodeInput} flex-1 bg-transparent text-body-md text-on-surface outline-none`}
                      disabled={saving || uploading}
                      maxLength={50}
                      placeholder="VD: AO01"
                      value={triggerCode}
                      onChange={(event) => setTriggerCode(event.target.value.toUpperCase())}
                    />
                  </div>
                  <p className="mt-1 text-label-sm text-on-surface-variant">AI tự nhận diện comment chứa mã này để chốt đơn</p>
                </div>
                <div>
                  <label className={labelClass} htmlFor="stock-warning">Ngưỡng cảnh báo tồn kho</label>
                  <input id="stock-warning" className={inputClass} disabled={saving || uploading} type="number" min="0" value={stockWarning} onChange={(event) => setStockWarning(Number(event.target.value))} />
                  <p className="mt-1 text-label-sm text-on-surface-variant">Thông báo khi tồn kho thấp hơn mức này</p>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-outline-variant p-3 transition-colors hover:bg-surface-container-low">
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
                  <span className="mt-0.5 block text-[11px] leading-snug text-on-surface-variant">
                    Giữ hàng 15 phút sau khi khách chốt đơn qua comment livestream, tự động hủy nếu không thanh toán.
                  </span>
                </span>
              </label>
            </div>
          </Card>

          {/* 3. Vận chuyển */}
          <Card className="!p-4 md:!p-6">
            <div className="mb-5 flex items-center gap-2 border-b border-outline-variant pb-4">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: "20px" }}>local_shipping</span>
              <h2 className="font-title-sm text-title-sm font-semibold">3. Thuộc tính vận chuyển</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelClass} htmlFor="shipping-weight">Trọng lượng đóng gói (Gram)</label>
                <input
                  id="shipping-weight"
                  className={inputClass}
                  disabled={saving || uploading}
                  type="number"
                  min="0"
                  placeholder="VD: 280"
                  value={shippingWeightGrams}
                  onChange={(event) => setShippingWeightGrams(event.target.value === "" ? "" : Number(event.target.value))}
                />
              </div>
              <div>
                <label className={labelClass}>Kích thước bưu kiện (Dài × Rộng × Cao, cm)</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { label: "Dài", value: packageLengthCm, setter: setPackageLengthCm },
                    { label: "Rộng", value: packageWidthCm, setter: setPackageWidthCm },
                    { label: "Cao", value: packageHeightCm, setter: setPackageHeightCm },
                  ] as const).map(({ label, value, setter }) => (
                    <div key={label} className="relative">
                      <input
                        aria-label={`Kích thước ${label.toLowerCase()} (cm)`}
                        className={`${inputClass} text-center`}
                        disabled={saving || uploading}
                        type="number"
                        min="0"
                        placeholder={label}
                        value={value}
                        onChange={(event) => setter(event.target.value === "" ? "" : Number(event.target.value))}
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">cm</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* 4. Bảng cấu hình biến thể & SKU riêng */}
          <Card className="!p-4 md:!p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant pb-4">
              <div>
                <h2 className="font-title-sm text-title-sm font-semibold">4. Bảng cấu hình biến thể &amp; SKU riêng</h2>
                <p className="mt-1 text-body-sm text-on-surface-variant">Giá được đồng bộ trực tiếp theo từng SKU.</p>
              </div>
              <button
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-fixed px-3 text-label-md font-semibold text-on-primary-fixed hover:bg-primary-fixed-dim"
                type="button"
                onClick={addSku}
                disabled={saving}
              >
                <Plus size={15} aria-hidden="true" /> Thêm SKU
              </button>
            </div>
            {skus.length === 0 ? (
              <p className="rounded-lg bg-surface-container-low p-4 text-body-sm text-on-surface-variant">Sản phẩm chưa có SKU nào.</p>
            ) : (
              <div className="space-y-3">
                {skus.map((sku, index) => (
                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-outline-variant p-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_0.7fr_0.7fr_0.8fr_auto]" key={sku.id ?? `new-${index}`}>
                    <div>
                      <label className={labelClass} htmlFor={`sku-code-${index}`}>Mã SKU</label>
                      <input id={`sku-code-${index}`} className={inputClass} disabled={saving || uploading} maxLength={50} value={sku.skuCode} onChange={(event) => updateSkuField(index, "skuCode", event.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`sku-variant-${index}`}>Phân loại</label>
                      <input id={`sku-variant-${index}`} className={inputClass} disabled={saving || uploading} maxLength={150} value={sku.variantName} onChange={(event) => updateSkuField(index, "variantName", event.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`sku-price-${index}`}>Giá (VND)</label>
                      <input id={`sku-price-${index}`} className={inputClass} disabled={saving || uploading} min="0" type="number" value={sku.price} onChange={(event) => updateSkuField(index, "price", event.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`sku-aicode-${index}`}>Mã AI</label>
                      <input id={`sku-aicode-${index}`} className={inputClass} disabled={saving || uploading} maxLength={50} placeholder="VD: AO01TM" value={sku.aiCode} onChange={(event) => updateSkuField(index, "aiCode", event.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`sku-stock-${index}`}>Tồn kho</label>
                      <input id={`sku-stock-${index}`} className={inputClass} disabled={saving || uploading} type="number" min="0" value={sku.stock} onChange={(event) => updateSkuField(index, "stock", Number(event.target.value))} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`sku-status-${index}`}>Trạng thái SKU</label>
                      <select id={`sku-status-${index}`} className={inputClass} disabled={saving || uploading} value={sku.status} onChange={(event) => updateSkuField(index, "status", event.target.value)}>
                        <option value="active">Đang bán</option>
                        <option value="archived">Lưu trữ</option>
                        <option value="discontinued">Ngừng kinh doanh</option>
                      </select>
                    </div>
                    {sku.id && sku.status !== "discontinued" && (
                      <button
                        aria-label={`Ngừng kinh doanh SKU ${sku.skuCode}`}
                        className="inline-flex h-10 items-center justify-center self-end rounded-lg border border-rose-200 px-3 text-rose-700 hover:bg-rose-50"
                        type="button"
                        disabled={saving || uploading}
                        onClick={() => updateSkuField(index, "status", "discontinued")}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                    {!sku.id && (
                      <button
                        aria-label={`Xóa SKU mới ${index + 1}`}
                        className="inline-flex h-10 items-center justify-center self-end rounded-lg border border-rose-200 px-3 text-rose-700 hover:bg-rose-50"
                        type="button"
                        disabled={saving || uploading}
                        onClick={() => setSkus((current) => current.filter((_, i) => i !== index))}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-5 xl:col-span-4">
          <Card className="!p-4 md:!p-5">
            <h2 className="mb-3 flex items-center gap-2 font-title-sm text-title-sm font-semibold">
              <Package size={18} className="text-primary" aria-hidden="true" /> Trạng thái bán hàng
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
                      {value === "active" ? "Sản phẩm có thể được hiển thị và bán." : value === "archived" ? "Ẩn khỏi danh sách sản phẩm đang bán." : "Đánh dấu sản phẩm không còn kinh doanh."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Card>

          <Card className="!p-4 md:!p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-title-sm text-title-sm font-semibold">
                <ImagePlus size={18} className="text-primary" aria-hidden="true" /> Hình ảnh ({product.images.length}/8)
              </h2>
              <span className="text-label-sm text-on-surface-variant">JPEG, PNG, WebP · tối đa 5MB</span>
            </div>
            {product.images.length > 0 && (
              <div className="mb-3 grid grid-cols-2 gap-2.5">
                {product.images.map((image) => (
                  <div className="group relative aspect-square overflow-hidden rounded-lg border border-outline-variant bg-surface-container" key={image.id}>
                    <Image fill unoptimized sizes="(max-width: 1280px) 45vw, 15vw" className="object-cover" src={image.url} alt={`Ảnh sản phẩm ${product.name}`} />
                    {image.isPrimary && <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-inverse-surface/85 px-1.5 py-1 text-[10px] font-semibold text-white"><Star size={11} fill="currentColor" /> Ảnh đại diện</span>}
                    <div className="absolute right-1 top-1 flex gap-1">
                      {!image.isPrimary && (
                        <button aria-label="Đặt làm ảnh đại diện" className="rounded bg-white/95 p-1.5 text-primary shadow hover:bg-white" type="button" disabled={saving || uploading} onClick={() => void setPrimaryImage(image.id)}>
                          <Star size={14} aria-hidden="true" />
                        </button>
                      )}
                      <button aria-label="Xóa ảnh" className="rounded bg-white/95 p-1.5 text-error shadow hover:bg-white" type="button" disabled={saving || uploading} onClick={() => void deleteImage(image.id)}>
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {product.images.length < 8 && (
              <button
                className="flex min-h-24 w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-outline-variant bg-surface-container-low px-4 py-4 text-center hover:border-primary hover:bg-primary-fixed/10 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || saving}
              >
                {uploading ? <LoaderCircle className="mb-1 animate-spin text-primary" size={20} aria-hidden="true" /> : <Upload className="mb-1 text-primary" size={20} aria-hidden="true" />}
                <span className="text-label-md font-semibold">{uploading ? "Đang tải ảnh..." : "Tải ảnh lên"}</span>
                <span className="mt-0.5 text-label-sm text-on-surface-variant">Chọn một hoặc nhiều ảnh sản phẩm</span>
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
            <h2 className="mb-2 font-title-sm text-title-sm font-semibold">Thông tin hệ thống</h2>
            <dl className="space-y-2 text-body-sm">
              <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Mã sản phẩm</dt><dd className="font-mono font-semibold">{product.id}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Ngày tạo</dt><dd>{new Date(product.createdAt).toLocaleDateString("vi-VN")}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Cập nhật lần cuối</dt><dd>{new Date(product.updatedAt).toLocaleDateString("vi-VN")}</dd></div>
            </dl>
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
