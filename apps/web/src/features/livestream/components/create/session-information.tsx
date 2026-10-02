"use client";

import { useRef, useState } from "react";
import { Video, Info, ImagePlus, Trash2, RefreshCw, AlertCircle } from "lucide-react";

interface SessionInformationProps {
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  coverImage: string | null;
  onCoverImageChange: (image: string | null) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  startTime: string;
  onStartTimeChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  endTime: string;
  onEndTimeChange: (value: string) => void;
  errors?: {
    title?: string;
    dates?: string;
    coverImage?: string;
  };
  disabled?: boolean;
  hideIvsNotice?: boolean;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function SessionInformation({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  coverImage,
  onCoverImageChange,
  startDate,
  onStartDateChange,
  startTime,
  onStartTimeChange,
  endDate,
  onEndDateChange,
  endTime,
  onEndTimeChange,
  errors = {},
  disabled = false,
  hideIvsNotice = false,
}: SessionInformationProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Check format
    if (!ALLOWED_TYPES.includes(file.type)) {
      setImageError("Định dạng không hợp lệ. Vui lòng chọn ảnh JPG, PNG hoặc WebP.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Check size
    if (file.size > MAX_FILE_SIZE) {
      setImageError("Dung lượng ảnh vượt quá 5MB. Vui lòng chọn ảnh nhẹ hơn.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Read and create preview
    const reader = new FileReader();
    reader.onload = () => {
      onCoverImageChange(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    onCoverImageChange(null);
    setImageError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <section className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-6 shadow-xs">
      {/* Header */}
      <div className="mb-5 border-b border-outline-variant/30 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Video className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-on-surface">Thông tin phiên</h2>
            <p className="text-xs text-on-surface-variant">
              Cấu hình tiêu đề, ảnh bìa, nội dung và thời gian phát sóng dự kiến.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Tên phiên Livestream */}
        <div className="md:col-span-2">
          <label
            htmlFor="livestream-title"
            className="mb-1.5 block text-xs font-semibold text-on-surface"
          >
            Tên phiên Livestream <span className="text-error">*</span>
          </label>
          <input
            id="livestream-title"
            disabled={disabled}
            className={`w-full rounded-lg border bg-surface-container-lowest px-3.5 py-2.5 text-sm text-on-surface transition-all placeholder:text-outline focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-container-low/50 disabled:opacity-70 ${
              errors.title
                ? "border-error focus:border-error focus:ring-2 focus:ring-error/20"
                : "border-outline-variant focus:border-primary focus:ring-2 focus:ring-primary/20"
            }`}
            placeholder="Ví dụ: Đại tiệc Flash Sale Thời Trang Công Sở Hè 2026..."
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
          />
          {errors.title ? (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-error">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{errors.title}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-on-surface-variant">
              Tên buổi phát trực tiếp hiển thị cho người xem và trên đơn nháp.
            </p>
          )}
        </div>

        {/* Ảnh bìa Livestream */}
        <div className="md:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold text-on-surface">
            Ảnh bìa Livestream{" "}
            <span className="font-normal text-outline">(Tùy chọn cho bản nháp)</span>
          </label>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={disabled}
            onChange={handleFileChange}
          />

          {coverImage ? (
            /* Image Preview */
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="relative aspect-video w-full max-w-xs shrink-0 overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverImage}
                  alt="Ảnh bìa phiên livestream"
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-on-surface">Ảnh bìa đã chọn (Preview)</p>
                <p className="text-[11px] text-outline">
                  Ảnh bìa sẽ hiển thị trên danh sách phiên phát sóng và thẻ chia sẻ livestream.
                </p>
                {!disabled && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-outline" aria-hidden="true" />
                      <span>Thay đổi ảnh</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/50 px-3 py-1.5 text-xs font-semibold text-error transition-colors hover:bg-red-100/70"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Xóa ảnh</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Upload Dropzone / Placeholder */
            <div
              onClick={() => !disabled && fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-outline-variant/70 p-5 text-center transition-all ${
                disabled
                  ? "cursor-not-allowed bg-surface-container-low/30 opacity-60"
                  : "cursor-pointer hover:border-primary/60 hover:bg-surface-container-low/40"
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ImagePlus className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="mt-2 text-xs font-semibold text-on-surface">
                {disabled ? "Ảnh bìa chưa được cập nhật" : "Nhấn để tải lên ảnh bìa livestream"}
              </p>
              <p className="mt-0.5 text-[11px] text-outline">
                Định dạng hỗ trợ: JPG, PNG, WebP (Tối đa 5MB, tỉ lệ 16:9 khuyến nghị)
              </p>
            </div>
          )}

          {/* Validation or File Error */}
          {(imageError || errors.coverImage) && (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-error">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{imageError || errors.coverImage}</span>
            </p>
          )}
        </div>

        {/* Mô tả phiên live */}
        <div className="md:col-span-2">
          <label
            htmlFor="livestream-description"
            className="mb-1.5 block text-xs font-semibold text-on-surface"
          >
            Mô tả phiên live & Thể lệ ưu đãi
          </label>
          <textarea
            id="livestream-description"
            disabled={disabled}
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-sm text-on-surface transition-all placeholder:text-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-surface-container-low/50 disabled:opacity-70"
            placeholder="Mục tiêu buổi live, chương trình freeship, mã voucher hoặc quà tặng kèm đơn..."
            rows={3}
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
          />
        </div>

        {/* Thời gian bắt đầu dự kiến */}
        <div>
          <label
            htmlFor="livestream-start-date"
            className="mb-1.5 block text-xs font-semibold text-on-surface"
          >
            Thời gian bắt đầu dự kiến
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="livestream-start-date" className="sr-only">
                Ngày bắt đầu
              </label>
              <input
                id="livestream-start-date"
                disabled={disabled}
                className={`w-full rounded-lg border bg-surface-container-lowest px-3 py-2 text-xs font-medium text-on-surface transition-all focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-container-low/50 disabled:opacity-70 ${
                  errors.dates
                    ? "border-error focus:border-error"
                    : "border-outline-variant focus:border-primary"
                }`}
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="livestream-start-time" className="sr-only">
                Giờ bắt đầu
              </label>
              <input
                id="livestream-start-time"
                disabled={disabled}
                className={`w-full rounded-lg border bg-surface-container-lowest px-3 py-2 text-xs font-medium text-on-surface transition-all focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-container-low/50 disabled:opacity-70 ${
                  errors.dates
                    ? "border-error focus:border-error"
                    : "border-outline-variant focus:border-primary"
                }`}
                type="time"
                value={startTime}
                onChange={(e) => onStartTimeChange(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Thời gian kết thúc dự kiến */}
        <div>
          <label
            htmlFor="livestream-end-date"
            className="mb-1.5 block text-xs font-semibold text-on-surface"
          >
            Thời gian kết thúc dự kiến (ước tính)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="livestream-end-date" className="sr-only">
                Ngày kết thúc
              </label>
              <input
                id="livestream-end-date"
                disabled={disabled}
                className={`w-full rounded-lg border bg-surface-container-lowest px-3 py-2 text-xs font-medium text-on-surface transition-all focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-container-low/50 disabled:opacity-70 ${
                  errors.dates
                    ? "border-error focus:border-error"
                    : "border-outline-variant focus:border-primary"
                }`}
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="livestream-end-time" className="sr-only">
                Giờ kết thúc
              </label>
              <input
                id="livestream-end-time"
                disabled={disabled}
                className={`w-full rounded-lg border bg-surface-container-lowest px-3 py-2 text-xs font-medium text-on-surface transition-all focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-container-low/50 disabled:opacity-70 ${
                  errors.dates
                    ? "border-error focus:border-error"
                    : "border-outline-variant focus:border-primary"
                }`}
                type="time"
                value={endTime}
                onChange={(e) => onEndTimeChange(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Date/Time Validation Error */}
        {errors.dates && (
          <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-medium text-error md:col-span-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errors.dates}</span>
          </div>
        )}

        {/* Thiết lập kênh video: Amazon IVS Channel Pool Notice */}
        {!hideIvsNotice && (
          <div className="pt-2 md:col-span-2">
            <div className="flex items-start gap-3 rounded-lg border border-outline-variant/50 bg-surface-container-low/70 p-3.5">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Info className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3 className="text-xs font-semibold text-on-surface">
                  Cấu hình truyền dẫn Video đám mây
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                  Amazon IVS Channel sẽ được hệ thống tự động phân bổ khi bạn bắt đầu phát sóng tại
                  Studio.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}