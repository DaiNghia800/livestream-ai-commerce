"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreatePageHeader } from "./create-page-header";
import { SessionInformation } from "./session-information";
import { SessionProducts } from "./session-products";
import { SessionSummary } from "./session-summary";
import { CreateActions } from "./create-actions";
import { ProductPicker } from "./product-picker";
import { mockCatalogProducts } from "../../mocks/products.mock";
import { mockLivestreams } from "../../mocks/livestream.mock";
import type { LiveProductItem } from "../../types/livestream";
import { CheckCircle2 } from "lucide-react";

export function LivestreamCreateForm() {
  const router = useRouter();

  // Helper to format today's date in local YYYY-MM-DD format
  const getTodayDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Form State
  const [title, setTitle] = useState("Xả Kho Đón Hè – BST Linen & Cotton Cao Cấp #05");
  const [description, setDescription] = useState(
    "Đại tiệc xả kho giữa năm: Miễn phí vận chuyển toàn quốc cho đơn hàng từ 2 sản phẩm chốt trên live. Tặng kèm quà tặng đặc biệt cho khách chốt đơn sớm!"
  );
  const [coverImage, setCoverImage] = useState<string | null>(
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDquS0Ga7ht0MFZWCn02YeM-3cRYr7nghO42T56Y1UU1qgvHPaOU8TnouNMD4iqxtneKByNyF4r5ru3XWBXuHEfnK0Z1m9cfJYIGEviC9u981Kx7ZyYodz5H3PVYyRIuSarSsv3yV1er5XLtbjaDyMm3oUfP7p0z8JBhFeMIn_AXc50DomAomiJ95CkB8I24x6wg1FKA6R9ksmLgbSmxWFdc3mU0Duazr5_CjWXImHNJysA502lX2sE"
  );
  const [startDate, setStartDate] = useState(getTodayDate());
  const [startTime, setStartTime] = useState("19:30");
  const [endDate, setEndDate] = useState(getTodayDate());
  const [endTime, setEndTime] = useState("22:30");

  // Initial products selected from catalog
  const [products, setProducts] = useState<LiveProductItem[]>([
    {
      id: mockCatalogProducts[0].id,
      sku: mockCatalogProducts[0].sku,
      name: mockCatalogProducts[0].name,
      price: mockCatalogProducts[0].price,
      originalPrice: mockCatalogProducts[0].originalPrice,
      stock: mockCatalogProducts[0].stock,
      image: mockCatalogProducts[0].image,
    },
    {
      id: mockCatalogProducts[1].id,
      sku: mockCatalogProducts[1].sku,
      name: mockCatalogProducts[1].name,
      price: mockCatalogProducts[1].price,
      originalPrice: mockCatalogProducts[1].originalPrice,
      stock: mockCatalogProducts[1].stock,
      image: mockCatalogProducts[1].image,
    },
    {
      id: mockCatalogProducts[2].id,
      sku: mockCatalogProducts[2].sku,
      name: mockCatalogProducts[2].name,
      price: mockCatalogProducts[2].price,
      originalPrice: mockCatalogProducts[2].originalPrice,
      stock: mockCatalogProducts[2].stock,
      image: mockCatalogProducts[2].image,
    },
  ]);

  // UI state
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    title?: string;
    dates?: string;
    coverImage?: string;
  }>({});

  // Product actions
  const handleAddProducts = (newProducts: LiveProductItem[]) => {
    setProducts((prev) => {
      const existingSkus = new Set(prev.map((p) => p.sku));
      const toAdd = newProducts.filter((p) => !existingSkus.has(p.sku));
      return [...prev, ...toAdd];
    });
  };

  const handleRemoveProduct = (sku: string) => {
    setProducts((prev) => prev.filter((p) => p.sku !== sku));
  };

  // Date sequence check
  const checkDatesValidity = (sDate: string, sTime: string, eDate: string, eTime: string) => {
    if (sDate && eDate) {
      const startDateTime = new Date(`${sDate}T${sTime || "00:00"}`);
      const endDateTime = new Date(`${eDate}T${eTime || "23:59"}`);
      if (!isNaN(startDateTime.getTime()) && !isNaN(endDateTime.getTime())) {
        if (endDateTime <= startDateTime) {
          return "Thời gian kết thúc dự kiến phải sau thời gian bắt đầu.";
        }
      }
    }
    return undefined;
  };

  // Validation
  const validateForm = () => {
    const newErrors: { title?: string; dates?: string } = {};

    if (!title.trim()) {
      newErrors.title = "Vui lòng nhập tên phiên Livestream.";
    }

    const dateErr = checkDatesValidity(startDate, startTime, endDate, endTime);
    if (dateErr) {
      newErrors.dates = dateErr;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Form validity for bottom indicator
  const isFormValid = Boolean(title.trim()) && !errors.title && !errors.dates;

  // Cancel Action
  const handleCancel = () => {
    const hasUnsavedChanges = Boolean(title.trim() || description.trim() || products.length > 0);
    if (hasUnsavedChanges) {
      if (
        window.confirm(
          "Bạn có chắc muốn thoát? Mọi thông tin vừa nhập chưa lưu sẽ không được ghi nhận."
        )
      ) {
        router.push("/shop/livestream");
      }
    } else {
      router.push("/shop/livestream");
    }
  };

  // Save Draft Action (Allows partial data, DRAFT status)
  const handleSaveDraft = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const draftTitle = title.trim() || `[Bản nháp] Phiên ${new Date().toLocaleDateString("vi-VN")}`;
    const newDraftId = `LIVE-DRAFT-${String(Date.now()).slice(-4)}`;

    // Add to mock livestream list
    mockLivestreams.unshift({
      id: newDraftId,
      title: draftTitle,
      status: "DRAFT",
      thumbnail: coverImage || undefined,
      hostName: "Chưa gán Host",
      timeDisplay: startDate ? `Dự kiến: ${startDate}` : "Chưa chốt ngày",
      subTimeDisplay: startTime ? `Lúc ${startTime}` : "Chưa chốt giờ",
      productCount: products.length,
    });

    setSuccessMessage(`Đã lưu bản nháp "${draftTitle}" thành công! (Dữ liệu mẫu frontend)`);

    setTimeout(() => {
      router.push("/shop/livestream");
    }, 800);
  };

  // Create Official Livestream Action
  const handleCreateLive = () => {
    if (isSubmitting) return;

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    const newLiveId = `LIVE-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`;

    // Add to mock livestream list
    mockLivestreams.unshift({
      id: newLiveId,
      title: title.trim(),
      status: "SCHEDULED",
      thumbnail: coverImage || undefined,
      hostName: "KOL / Host Shop",
      timeDisplay: `${startTime || "19:00"} - ${endTime || "22:00"}`,
      subTimeDisplay: `Lịch phát: ${startDate || getTodayDate()}`,
      productCount: products.length,
    });

    setSuccessMessage(
      `Đã khởi tạo phiên Livestream "${title.trim()}" thành công! (Dữ liệu mẫu frontend)`
    );

    setTimeout(() => {
      router.push("/shop/livestream");
    }, 800);
  };

  return (
    <div className="pb-12">
      {/* Page Header */}
      <CreatePageHeader />

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="mb-6 flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 shadow-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>{successMessage} Đang chuyển hướng về danh sách phiên...</span>
        </div>
      )}

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        {/* Main Column (8 cols): Thông tin phiên & Sản phẩm */}
        <div className="flex flex-col gap-6 xl:col-span-8">
          <SessionInformation
            title={title}
            onTitleChange={(v) => {
              setTitle(v);
              if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
            }}
            description={description}
            onDescriptionChange={setDescription}
            coverImage={coverImage}
            onCoverImageChange={(v) => {
              setCoverImage(v);
              if (errors.coverImage) setErrors((prev) => ({ ...prev, coverImage: undefined }));
            }}
            startDate={startDate}
            onStartDateChange={(v) => {
              setStartDate(v);
              const dateErr = checkDatesValidity(v, startTime, endDate, endTime);
              setErrors((prev) => ({ ...prev, dates: dateErr }));
            }}
            startTime={startTime}
            onStartTimeChange={(v) => {
              setStartTime(v);
              const dateErr = checkDatesValidity(startDate, v, endDate, endTime);
              setErrors((prev) => ({ ...prev, dates: dateErr }));
            }}
            endDate={endDate}
            onEndDateChange={(v) => {
              setEndDate(v);
              const dateErr = checkDatesValidity(startDate, startTime, v, endTime);
              setErrors((prev) => ({ ...prev, dates: dateErr }));
            }}
            endTime={endTime}
            onEndTimeChange={(v) => {
              setEndTime(v);
              const dateErr = checkDatesValidity(startDate, startTime, endDate, v);
              setErrors((prev) => ({ ...prev, dates: dateErr }));
            }}
            errors={errors}
          />

          <SessionProducts
            products={products}
            onOpenPicker={() => setIsPickerOpen(true)}
            onRemoveProduct={handleRemoveProduct}
          />
        </div>

        {/* Sidebar Column (4 cols): Tóm tắt phiên (Compact, self-start) */}
        <div className="self-start xl:col-span-4">
          <SessionSummary
            title={title}
            startDate={startDate}
            startTime={startTime}
            endDate={endDate}
            endTime={endTime}
            products={products}
          />
        </div>
      </div>

      {/* Bottom Sticky Action Bar */}
      <CreateActions
        onCancel={handleCancel}
        onSaveDraft={handleSaveDraft}
        onCreateLive={handleCreateLive}
        isSubmitting={isSubmitting}
        isValid={isFormValid}
      />

      {/* Product Picker Modal */}
      <ProductPicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        selectedProducts={products}
        onAddProducts={handleAddProducts}
      />
    </div>
  );
}