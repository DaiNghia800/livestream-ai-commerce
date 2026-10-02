import { Loader2, Save } from "lucide-react";

interface EditActionsProps {
  onCancel: () => void;
  onSave: () => void;
  isSubmitting?: boolean;
  isValid?: boolean;
  canEdit?: boolean;
  isDirty?: boolean;
}

export function EditActions({
  onCancel,
  onSave,
  isSubmitting = false,
  isValid = true,
  canEdit = true,
  isDirty = false,
}: EditActionsProps) {
  const getStatusIndicator = () => {
    if (!canEdit) {
      return (
        <div className="flex items-center gap-2 text-xs text-amber-700">
          <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
          <span>Phiên ở trạng thái không cho phép chỉnh sửa cấu hình</span>
        </div>
      );
    }

    if (!isValid) {
      return (
        <div className="flex items-center gap-2 text-xs text-error">
          <span className="h-2 w-2 rounded-full bg-error" aria-hidden="true" />
          <span>Vui lòng kiểm tra và sửa các trường lỗi (*)</span>
        </div>
      );
    }

    if (isDirty) {
      return (
        <div className="flex items-center gap-2 text-xs text-on-surface-variant">
          <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" />
          <span>Có thay đổi chưa lưu</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 text-xs text-outline">
        <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
        <span>Chưa có thay đổi nào</span>
      </div>
    );
  };

  return (
    <div className="sticky bottom-4 z-20 mt-8 rounded-xl border border-outline-variant/60 bg-surface-container-lowest/95 p-4 shadow-lg backdrop-blur-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Status telemetry indicator */}
        {getStatusIndicator()}

        {/* Action Buttons Cluster */}
        <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-low active:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50"
          >
            Hủy
          </button>

          <button
            type="button"
            disabled={isSubmitting || !canEdit}
            onClick={onSave}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-primary-container active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Đang lưu...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" aria-hidden="true" />
                <span>Lưu thay đổi</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}