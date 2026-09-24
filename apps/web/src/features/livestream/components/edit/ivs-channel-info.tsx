import { Info, Radio, Archive } from "lucide-react";
import type { LivestreamStatus } from "../../types/livestream";

interface IvsChannelInfoProps {
  status: LivestreamStatus;
  ivsChannel?: string;
  channelName?: string;
  resolution?: string;
}

export function IvsChannelInfo({
  status,
  ivsChannel,
  channelName,
  resolution,
}: IvsChannelInfoProps) {
  // Case DRAFT or SCHEDULED: System allocates IVS Channel from pool when live broadcast starts at Studio
  if (status === "DRAFT" || status === "SCHEDULED") {
    return (
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-outline-variant/50 bg-surface-container-low/70 p-4 shadow-xs">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Info className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="flex-1 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-on-surface">Cấu hình truyền dẫn Video đám mây</span>
            {ivsChannel ? (
              <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-900">
                Gán trước: {ivsChannel}
              </span>
            ) : (
              <span className="rounded bg-surface-container px-1.5 py-0.5 font-mono text-[10px] font-medium text-outline">
                Amazon IVS Channel Pool
              </span>
            )}
          </div>
          <p className="mt-1 text-on-surface-variant leading-relaxed">
            Amazon IVS Channel sẽ được hệ thống tự động phân bổ khi bạn bắt đầu phát sóng tại Studio.
            Không hiển thị Stream Key trên giao diện quản trị để bảo mật luồng phát.
          </p>
        </div>
      </div>
    );
  }

  // Case LIVE: Only show channel info if mock data actually has it
  if (status === "LIVE") {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-100 text-emerald-800">
            <Radio className="h-5 w-5 animate-pulse text-emerald-700" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                Amazon IVS Channel:
              </span>
              <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-xs font-bold text-emerald-900">
                {ivsChannel || "IVS-ACTIVE-POOL"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-200/80 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-700 animate-pulse" />
                Đang phát trực tiếp
              </span>
              {resolution && (
                <span className="rounded bg-emerald-200/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-900">
                  {resolution}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-emerald-800">
              {channelName || "Kênh phát luồng trực tiếp chính"} · Stream Key được bảo mật và mã hóa trong phiên.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Case STARTING: In the middle of initializing channel from pool
  if (status === "STARTING") {
    return (
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-xs">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
          <Radio className="h-4 w-4 animate-ping" aria-hidden="true" />
        </div>
        <div className="flex-1 text-xs text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <span>Đang khởi tạo kênh Amazon IVS</span>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
              Đang phân bổ từ Pool
            </span>
          </div>
          <p className="mt-1 leading-relaxed text-amber-800">
            Hệ thống đang chuẩn bị tài nguyên luồng phát và camera tại Studio.
          </p>
        </div>
      </div>
    );
  }

  // Case ENDED: Channel has been released back to pool
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-low/50 p-4 shadow-xs">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container text-outline">
        <Archive className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="flex-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-on-surface">Kênh Amazon IVS đã giải phóng</span>
          {ivsChannel && (
            <span className="rounded bg-surface-container px-1.5 py-0.5 font-mono text-[10px] font-medium text-on-surface-variant">
              Kênh đã dùng: {ivsChannel}
            </span>
          )}
        </div>
        <p className="mt-1 leading-relaxed text-on-surface-variant">
          Phiên phát đã kết thúc. Tài nguyên phát sóng Amazon IVS đã được giải phóng về Channel Pool.
        </p>
      </div>
    </div>
  );
}