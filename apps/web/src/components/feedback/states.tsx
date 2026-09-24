import type { ReactNode } from "react";
export function LoadingState() {
  return (
    <div className="state" role="status">
      Đang tải nội dung…
    </div>
  );
}
export function EmptyState({
  title = "Chưa có dữ liệu",
  description = "Thử thay đổi bộ lọc hoặc quay lại sau.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="state">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
export function ErrorState({ action }: { action?: ReactNode }) {
  return (
    <div className="state" role="alert">
      <h2>Không thể tải nội dung</h2>
      <p>Vui lòng thử lại sau ít phút.</p>
      {action}
    </div>
  );
}
