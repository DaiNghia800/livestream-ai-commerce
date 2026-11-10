"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { formatCountdown, formatDateTime } from "@/lib/format";
import { reviewQueueApi, type PurchaseRequest } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-now";
import { guardReasonLabels } from "./labels";

/**
 * Hàng đợi duyệt — QĐ-3.
 *
 * Bình luận mà AI không chắc sẽ dừng ở đây chờ người thật quyết, và
 * TỒN VẪN ĐANG BỊ GIỮ trong lúc chờ. Vì thế màn hình này đặt đồng hồ
 * đếm ngược lên trước mọi thứ khác: mỗi phút nhân viên chần chừ là
 * một phút hàng không bán được cho người khác.
 */
export function ReviewQueue({ merchantId }: { merchantId: string }) {
  const [filter, setFilter] = useState("");
  const { data, loading, error, reload } = useApi(
    () => reviewQueueApi.list(merchantId, 100),
    [merchantId],
  );

  const items = useMemo(() => data ?? [], [data]);
  const now = useNow(items.length > 0);

  const filtered = useMemo(() => {
    const key = filter.toLocaleLowerCase("vi").trim();
    if (!key) return items;
    return items.filter((r) =>
      `${r.commentId ?? ""} ${commentText(r)}`.toLocaleLowerCase("vi").includes(key),
    );
  }, [items, filter]);

  // `now` bằng 0 ở lần render đầu (xem useNow). Chưa biết mấy giờ thì
  // chưa kết luận cái gì sắp hết hạn — gọi Date.now() ngay trong thân
  // render là hàm không thuần khiết, mỗi lần render ra một kết quả.
  const sapHetHan = now
    ? items.filter(
        (r) => r.heldUntil && new Date(r.heldUntil).getTime() - now < 60_000,
      )
    : [];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">HÀNG ĐỢI DUYỆT</p>
          <h1>Bình luận cần người xác nhận</h1>
          <p className="muted">
            AI không đủ chắc để tự chốt. Hàng đã được giữ sẵn, duyệt là thành
            đơn ngay.
          </p>
        </div>
        <div className="head-actions">
          <Button variant="secondary" onClick={reload}>
            Làm mới
          </Button>
        </div>
      </div>

      <div className="metric-grid">
        <Card>
          <h2 className="muted">Đang chờ duyệt</h2>
          <strong className="metric-value">{items.length}</strong>
          <p className="metric-note">Cũ nhất lên đầu</p>
        </Card>
        <Card>
          <h2 className="muted">Sắp hết hạn giữ</h2>
          <strong className="metric-value">{sapHetHan.length}</strong>
          <p className="metric-note">Còn dưới một phút</p>
        </Card>
        <Card>
          <h2 className="muted">Không giữ tồn</h2>
          <strong className="metric-value">
            {items.filter((r) => !r.heldUntil).length}
          </strong>
          <p className="metric-note">Bị chặn vì gom quá nhiều</p>
        </Card>
      </div>

      {sapHetHan.length > 0 && (
        <div className="notice notice-danger" role="alert">
          <h3>{sapHetHan.length} đề nghị sắp hết hạn giữ hàng</h3>
          <p>
            Quá hạn thì hệ thống tự trả hàng về kho và khách mất đơn, dù họ đã
            chốt trước người khác.
          </p>
        </div>
      )}

      <Card>
        <div className="section-heading">
          <div>
            <h2>Danh sách chờ</h2>
            <p className="muted">
              Duyệt sẽ chuyển hàng đang giữ sang đơn, tồn kho không thay đổi.
            </p>
          </div>
        </div>

        <div className="filters">
          <Input
            label="Tìm trong bình luận"
            placeholder="Nội dung bình luận hoặc mã bình luận…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState
            action={
              <Button variant="secondary" onClick={reload}>
                Thử lại
              </Button>
            }
          />
        ) : filtered.length ? (
          <div className="stack">
            {filtered.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                now={now}
                onDone={reload}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Hàng đợi trống"
            description="Mọi bình luận đều đã được AI xử lý hoặc nhân viên duyệt xong."
          />
        )}
      </Card>
    </>
  );
}

/** Lấy câu bình luận gốc mà AI đã đọc, để nhân viên còn phán. */
function commentText(request: PurchaseRequest): string {
  const ai = request.aiResult as { text?: string } | null;
  return ai?.text ?? "";
}

function RequestCard({
  request,
  now,
  onDone,
}: {
  request: PurchaseRequest;
  now: number;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remaining =
    !request.heldUntil || !now
      ? null
      : Math.max(
          0,
          Math.round((new Date(request.heldUntil).getTime() - now) / 1000),
        );

  const confidence = Math.round(Number(request.confidence) * 100);

  async function run(ten: string, fn: () => Promise<unknown>) {
    setBusy(ten);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <div className="section-heading">
        <h3 className="title-icon">
          <Sparkles size={18} aria-hidden="true" /> AI chắc {confidence}%
        </h3>
        {remaining === null ? (
          <Badge tone="danger">Không giữ tồn</Badge>
        ) : (
          <span className="countdown" data-urgent={remaining < 60}>
            {formatCountdown(remaining)}
          </span>
        )}
      </div>

      {commentText(request) && (
        <p className="chat-hint">“{commentText(request)}”</p>
      )}

      {/* Vì sao đề nghị này rơi vào hàng đợi. Thiếu phần này thì nhân
          viên duyệt bừa, và guard coi như vô nghĩa. */}
      {request.guardReasons && request.guardReasons.length > 0 && (
        <div className="chip-row">
          {request.guardReasons.map((r) => (
            <Badge key={r} tone="warning">
              {guardReasonLabels[r] ?? r}
            </Badge>
          ))}
        </div>
      )}

      <dl className="kv">
        <div>
          <dt>Mặt hàng đã giữ</dt>
          <dd>
            {request.lines?.length
              ? request.lines.map((l) => (
                  <p key={l.skuId}>
                    {l.skuId.slice(0, 8)}… × {l.quantity}
                    {l.quantity < l.requestedQty && (
                      <span className="muted">
                        {" "}
                        (khách muốn {l.requestedQty})
                      </span>
                    )}
                  </p>
                ))
              : "Không giữ được mã nào"}
          </dd>
        </div>
        <div>
          <dt>Thời điểm bình luận</dt>
          <dd>{formatDateTime(request.createdAt)}</dd>
        </div>
      </dl>

      {error && (
        <div className="notice notice-danger" role="alert">
          <p>{error}</p>
        </div>
      )}

      <div className="head-actions">
        <Button
          disabled={busy !== null}
          onClick={() => run("approve", () => reviewQueueApi.approve(request.id))}
        >
          <Check size={17} aria-hidden="true" />{" "}
          {busy === "approve" ? "Đang duyệt…" : "Duyệt thành đơn"}
        </Button>
        <Button
          variant="danger"
          disabled={busy !== null}
          onClick={() =>
            run("reject", () => reviewQueueApi.reject(request.id, "NOT_AN_ORDER"))
          }
        >
          <X size={17} aria-hidden="true" />{" "}
          {busy === "reject" ? "Đang từ chối…" : "Không phải đơn"}
        </Button>
        <Link className="link-inline" href={`/shop/orders`}>
          Xem đơn hàng
        </Link>
      </div>
    </Card>
  );
}
