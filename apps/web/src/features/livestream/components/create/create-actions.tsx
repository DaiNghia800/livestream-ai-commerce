import { Save, Video, Loader2 } from "lucide-react";

interface CreateActionsProps {
  onCancel: () => void;
  onSaveDraft: () => void;
  onCreateLive: () => void;
  isSubmitting?: boolean;
  isValid?: boolean;
}

export function CreateActions({
  onCancel,
  onSaveDraft,
  onCreateLive,
  isSubmitting = false,
  isValid = true,
}: CreateActionsProps) {
  return (
    <div className="sticky bottom-4 z-20 mt-8 rounded-xl border border-outline-variant/60 bg-surface-container-lowest/95 p-4 shadow-lg backdrop-blur-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left Information Notice */}
        <div className="flex items-center gap-2 text-xs text-on-surface-variant">
          {isValid ? (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>Thông tin hợp lệ, sẵn sàng tạo phiên</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
              <span>Vui lòng hoàn tất các thông tin bắt buộc (*)</span>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
          {/* Nút Hủy */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-low active:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50"
          >
            Hủy
          </button>

          {/* Nút Lưu bản nháp */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onSaveDraft}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-outline-variant/80 bg-surface-container-high px-4 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-highest active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5 text-on-surface-variant" aria-hidden="true" />
            <span>Lưu bản nháp</span>
          </button>

          {/* Nút chính: Tạo phiên Livestream */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCreateLive}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-primary-container active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <Video className="h-4 w-4" aria-hidden="true" />
                <span>Tạo phiên Livestream</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}