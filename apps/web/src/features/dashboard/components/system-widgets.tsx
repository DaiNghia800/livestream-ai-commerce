// System Widgets: Gemini AI and Amazon SQS

export function SystemWidgets() {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Widget 1: Google Gemini Chat Stream Parsing Engine */}
      <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/70 shadow-sm hover:shadow transition-shadow">
        <div className="flex items-center justify-between pb-3 border-b border-outline-variant/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">smart_toy</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-title-sm font-title-sm text-on-surface">
                  AI xử lý Chat (Google Gemini)
                </h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                  Độ chính xác: 98.2%
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Trích xuất cú pháp đặt hàng từ comment livestream thời gian thực
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-outline bg-surface-container-low px-2 py-1 rounded hidden xl:inline">
            Model: gemini-1.5-flash
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2 mt-3 text-center">
          <div className="p-2.5 rounded-lg bg-surface-container-low/70 border border-outline-variant/30">
            <span className="text-[11px] text-on-surface-variant block">Tin nhắn đã nhận</span>
            <span className="text-body-lg font-headline-md font-bold text-on-surface tabular-nums">
              18,450
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200/50">
            <span className="text-[11px] text-amber-800 block">Đang phân tích</span>
            <span className="text-body-lg font-headline-md font-bold text-amber-700 tabular-nums">
              12
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-200/50">
            <span className="text-[11px] text-indigo-800 block">Ý định mua</span>
            <span className="text-body-lg font-headline-md font-bold text-primary tabular-nums">
              2,180
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200/50">
            <span className="text-[11px] text-emerald-800 block">Đã tạo Pending</span>
            <span className="text-body-lg font-headline-md font-bold text-emerald-700 tabular-nums">
              1,840
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-surface-container-low/70 border border-outline-variant/30">
            <span className="text-[11px] text-on-surface-variant block">Lỗi / Bỏ qua</span>
            <span className="text-body-lg font-headline-md font-bold text-outline tabular-nums">
              85
            </span>
          </div>
        </div>
      </div>

      {/* Widget 2: Amazon SQS Message Queue */}
      <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/70 shadow-sm hover:shadow transition-shadow">
        <div className="flex items-center justify-between pb-3 border-b border-outline-variant/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
              <span className="material-symbols-outlined text-[20px]">layers</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-title-sm font-title-sm text-on-surface">
                  Hàng đợi Amazon SQS
                </h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Độ trễ TB: 140ms
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Bộ đệm xử lý phân luồng chống nghẽn đơn cao điểm livestream
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-outline bg-surface-container-low px-2 py-1 rounded hidden xl:inline">
            FIFO: order-events.fifo
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-3">
          <div className="p-2.5 rounded-lg bg-surface-container-low/70 border border-outline-variant/30 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-on-surface-variant block">Đang chờ (Queue)</span>
              <span className="text-body-lg font-headline-md font-bold text-on-surface tabular-nums">
                24{" "}
                <span className="text-[12px] font-normal text-on-surface-variant">msgs</span>
              </span>
            </div>
            <span className="material-symbols-outlined text-outline text-[22px]">hourglass_top</span>
          </div>
          <div className="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-200/50 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-indigo-800 block">Đang xử lý</span>
              <span className="text-body-lg font-headline-md font-bold text-primary tabular-nums">
                8{" "}
                <span className="text-[12px] font-normal text-indigo-600">msgs</span>
              </span>
            </div>
            <span className="material-symbols-outlined text-primary text-[22px]">sync</span>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200/50 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-emerald-800 block">Thất bại (DLQ)</span>
              <span className="text-body-lg font-headline-md font-bold text-emerald-700 tabular-nums">
                0{" "}
                <span className="text-[12px] font-normal text-emerald-600">msgs</span>
              </span>
            </div>
            <span className="material-symbols-outlined text-emerald-600 text-[22px]">check_circle</span>
          </div>
        </div>
      </div>
    </section>
  );
}
