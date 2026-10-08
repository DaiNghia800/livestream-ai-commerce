"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EditPageHeader } from "./edit-page-header";
import { IvsChannelInfo } from "./ivs-channel-info";
import { EditActions } from "./edit-actions";
import { SessionInformation } from "../create/session-information";
import { SessionProducts } from "../create/session-products";
import { ProductPicker } from "../create/product-picker";
import { SessionSummary } from "../create/session-summary";
import { mockLivestreams } from "../../mocks/livestream.mock";
import { mockCatalogProducts } from "../../mocks/products.mock";
import type { LiveProductItem, Livestream } from "../../types/livestream";
import { AlertTriangle, ArrowLeft, CheckCircle2, ShieldAlert } from "lucide-react";

interface LivestreamEditFormProps {
  livestreamId: string;
}

export function LivestreamEditForm({ livestreamId }: LivestreamEditFormProps) {
  // Find session from mock data
  const session = useMemo(() => {
    return mockLivestreams.find((item) => item.id === livestreamId);
  }, [livestreamId]);

  // If session is not found, render Not Found state
  if (!session) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-on-surface">Không tìm thấy phiên Livestream</h1>
        <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
          Mã phiên <strong className="font-mono text-on-surface">#{livestreamId}</strong> không tồn tại
          hoặc đã bị xóa khỏi hệ thống mẫu.
        </p>
        <Link
          href="/shop/livestream"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:bg-primary-container"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Quay về danh sách phiên</span>
        </Link>
      </div>
    );
  }

  return <LivestreamEditContent session={session} />;
}

function LivestreamEditContent({ session }: { session: Livestream }) {
  const router = useRouter();

  // Check edit permission according to status architecture:
  // DRAFT / SCHEDULED: can edit.
  // STARTING, LIVE, PAUSED, ENDED: read-only form.
  const canEdit = session.status === "DRAFT" || session.status === "SCHEDULED";

  // Helper for initial date
  const getInitialStartDate = () => {
    if (session.startDate) return session.startDate;
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Helper for initial products
  const getInitialProducts = (): LiveProductItem[] => {
    if (session.products && session.products.length > 0) {
      return [...session.products];
    }
    if (session.productCount > 0) {
      return mockCatalogProducts.slice(0, Math.min(session.productCount, mockCatalogProducts.length)).map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: p.price,
        originalPrice: p.originalPrice,
        stock: p.stock,
        image: p.image,
      }));
    }
    return [];
  };

  // Form State
  const initialTitle = session.title || "";
  const initialDescription =
    session.description ||
    "Phiên phát trực tiếp bán hàng với nhiều ưu đãi giảm giá và mã voucher hấp dẫn.";
  const initialCoverImage = session.thumbnail || null;
  const initialStartDate = getInitialStartDate();
  const initialStartTime = session.startTime || "19:30";
  const initialEndDate = session.endDate || getInitialStartDate();
  const initialEndTime = session.endTime || "22:00";
  const initialProducts = getInitialProducts();

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [coverImage, setCoverImage] = useState<string | null>(initialCoverImage);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [products, setProducts] = useState<LiveProductItem[]>(initialProducts);

  // UI state
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    title?: string;
    dates?: string;
    coverImage?: string;
  }>({});

  // Compute dirty state
  const isDirty = useMemo(() => {
    if (title !== initialTitle) return true;
    if (description !== initialDescription) return true;
    if (coverImage !== initialCoverImage) return true;
    if (startDate !== initialStartDate) return true;
    if (startTime !== initialStartTime) return true;
    if (endDate !== initialEndDate) return true;
    if (endTime !== initialEndTime) return true;
    if (products.length !== initialProducts.length) return true;
    const initialSkus = initialProducts.map((p) => p.sku).join(",");
    const currentSkus = products.map((p) => p.sku).join(",");
    return initialSkus !== currentSkus;
  }, [
    title,
    initialTitle,
    description,
    initialDescription,
    coverImage,
    initialCoverImage,
    startDate,
    initialStartDate,
    startTime,
    initialStartTime,
    endDate,
    initialEndDate,
    endTime,
    initialEndTime,
    products,
    initialProducts,
  ]);

  // Product actions
  const handleAddProducts = (newProducts: LiveProductItem[]) => {
    if (!canEdit) return;
    setProducts((prev) => {
      const existingSkus = new Set(prev.map((p) => p.sku));
      const toAdd = newProducts.filter((p) => !existingSkus.has(p.sku));
      return [...prev, ...toAdd];
    });
  };

  const handleRemoveProduct = (sku: string) => {
    if (!canEdit) return;
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

  const isFormValid = Boolean(title.trim()) && !errors.title && !errors.dates;

  // Cancel Action
  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        "Bạn có các thay đổi chưa lưu. Bạn có chắc muốn hủy và quay lại danh sách phiên?"
      );
      if (confirmed) {
        router.push("/shop/livestream");
      }
    } else {
      router.push("/shop/livestream");
    }
  };

  // Save changes action
  const handleSave = () => {
    if (isSubmitting || !canEdit) return;

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    // Update in mockLivestreams array
    const targetIndex = mockLivestreams.findIndex((item) => item.id === session.id);
    if (targetIndex !== -1) {
      mockLivestreams[targetIndex] = {
        ...mockLivestreams[targetIndex],
        title: title.trim(),
        description: description.trim(),
        thumbnail: coverImage || undefined,
        startDate,
        startTime,
        endDate,
        endTime,
        timeDisplay: `${startTime || "19:00"} - ${endTime || "22:00"}`,
        subTimeDisplay: `Lịch phát: ${startDate}`,
        productCount: products.length,
        products: [...products],
        // Preserves existing status & IVS channel info!
      };
    }

    setSuccessMessage(
      `Đã cập nhật thông tin phiên "${title.trim()}" thành công! (Dữ liệu mẫu frontend)`
    );

    setTimeout(() => {
      router.push("/shop/livestream");
    }, 800);
  };

  return (
    <div className="pb-12">
      {/* 1. Page Header */}
      <EditPageHeader sessionId={session.id} status={session.status} />

      {/* 2. Amazon IVS Channel Pool Info */}
      <IvsChannelInfo
        status={session.status}
        ivsChannel={session.ivsChannel}
        channelName={session.channelName}
        resolution={session.resolution}
      />

      {/* Permission Warning Banner if status is not editable */}
      {!canEdit && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-900 shadow-xs">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="flex-1">
            <strong className="font-semibold">Chế độ chỉ xem (Read-only):</strong> Phiên đang ở trạng
            thái <span className="font-bold underline">{session.status}</span>. Để đảm bảo toàn vẹn
            dữ liệu phát sóng và chốt đơn, thông tin phiên và danh sách sản phẩm không thể chỉnh sửa
            trực tiếp tại đây.
          </div>
        </div>
      )}

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="mb-6 flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 shadow-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>{successMessage} Đang chuyển hướng về danh sách phiên...</span>
        </div>
      )}

      {/* 3. 2-Column Responsive Layout (8 cols left / 4 cols right) */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        {/* Main Column (8 cols): Thông tin phiên & Sản phẩm Livestream */}
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
            disabled={!canEdit}
            hideIvsNotice={true}
          />

          <SessionProducts
            products={products}
            onOpenPicker={() => setIsPickerOpen(true)}
            onRemoveProduct={handleRemoveProduct}
            disabled={!canEdit}
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

      {/* 4. Bottom Sticky Action Bar */}
      <EditActions
        onCancel={handleCancel}
        onSave={handleSave}
        isSubmitting={isSubmitting}
        isValid={isFormValid}
        canEdit={canEdit}
        isDirty={isDirty}
      />

      {/* 5. Product Picker Modal */}
      <ProductPicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        selectedProducts={products}
        onAddProducts={handleAddProducts}
      />
    </div>
  );
}