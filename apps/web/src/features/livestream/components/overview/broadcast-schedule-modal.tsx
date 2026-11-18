"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Clock,
  Radio,
  X,
  CalendarCheck,
} from "lucide-react";
import type { Livestream } from "../../types/livestream";

export interface BroadcastScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Livestream[];
}

const WEEKDAY_NAMES = [
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
  "Chủ nhật",
];

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // Monday is 1, Sunday is 0 -> convert so Monday is first day of week
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function BroadcastScheduleModal({
  isOpen,
  onClose,
  items,
}: BroadcastScheduleModalProps) {
  const [weekOffset, setWeekOffset] = useState(0);

  const todayKey = useMemo(() => formatDateKey(new Date()), []);

  // Compute 7 days for the displayed week
  const { weekDays, weekRangeLabel } = useMemo(() => {
    const today = new Date();
    const monday = getStartOfWeek(today);
    monday.setDate(monday.getDate() + weekOffset * 7);

    const days: { date: Date; key: string; weekday: string; isToday: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const current = new Date(monday);
      current.setDate(monday.getDate() + i);
      const key = formatDateKey(current);
      days.push({
        date: current,
        key,
        weekday: WEEKDAY_NAMES[i],
        isToday: key === todayKey,
      });
    }

    const startStr = `${monday.getDate()}/${monday.getMonth() + 1}`;
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const endStr = `${sunday.getDate()}/${sunday.getMonth() + 1}/${sunday.getFullYear()}`;

    return {
      weekDays: days,
      weekRangeLabel: `${startStr} – ${endStr}`,
    };
  }, [weekOffset, todayKey]);

  // Map livestreams to each date
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Livestream[]>();
    for (const item of items) {
      const rawDate = item.scheduledAt || item.startedAt || item.createdAt;
      if (!rawDate) continue;
      try {
        const d = new Date(rawDate);
        if (isNaN(d.getTime())) continue;
        const key = formatDateKey(d);
        const existing = map.get(key) || [];
        existing.push(item);
        map.set(key, existing);
      } catch {
        // Ignore invalid dates
      }
    }
    return map;
  }, [items]);

  // Count scheduled sessions in the displayed week
  const totalInWeek = useMemo(() => {
    let count = 0;
    for (const day of weekDays) {
      const list = sessionsByDate.get(day.key) || [];
      count += list.length;
    }
    return count;
  }, [weekDays, sessionsByDate]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-6xl max-h-[92vh] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* ================= MODAL HEADER ================= */}
        <header className="px-5 py-4 border-b border-outline-variant/60 flex flex-wrap items-center justify-between gap-3 bg-surface-container-low/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
              <CalendarDays className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="schedule-modal-title"
                className="text-lg font-bold text-on-surface"
              >
                Lịch phát sóng Livestream
              </h2>
              <p className="text-xs text-outline">
                Lên lịch biểu, theo dõi các phiên trực tiếp và phân bổ ca live
                trong tuần
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Week navigation */}
            <div className="flex items-center gap-1 bg-surface-container rounded-xl p-1 border border-outline-variant text-xs">
              <button
                type="button"
                onClick={() => setWeekOffset((prev) => prev - 1)}
                aria-label="Tuần trước"
                className="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold px-2 text-on-surface">
                {weekRangeLabel}
              </span>
              <button
                type="button"
                onClick={() => setWeekOffset((prev) => prev + 1)}
                aria-label="Tuần sau"
                className="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {weekOffset !== 0 && (
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="px-2.5 py-1.5 rounded-xl border border-outline-variant bg-surface text-xs font-medium text-primary hover:bg-surface-container transition-colors"
              >
                Hôm nay
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng cửa sổ lịch"
              className="p-2 rounded-xl text-outline hover:text-on-surface hover:bg-surface-container transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* ================= CALENDAR GRID BODY ================= */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 custom-scrollbar">
          {/* Quick Stat Bar */}
          <div className="mb-4 flex items-center justify-between px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/60 text-xs text-on-surface-variant">
            <span className="flex items-center gap-1.5 font-medium">
              <CalendarCheck className="w-4 h-4 text-primary" aria-hidden="true" />
              <span>
                Tổng số phiên trong tuần này:{" "}
                <strong className="text-on-surface">{totalInWeek}</strong> phiên
              </span>
            </span>
            <span className="text-[11px] text-outline">
              Bấm vào phiên để xem chi tiết hoặc bắt đầu phát sóng
            </span>
          </div>

          {/* 7-Day Columns Grid */}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-stretch min-h-[380px]">
            {weekDays.map((day) => {
              const sessions = sessionsByDate.get(day.key) || [];
              return (
                <div
                  key={day.key}
                  className={`flex flex-col justify-between rounded-xl border p-2.5 transition-all ${
                    day.isToday
                      ? "border-primary bg-primary/5 shadow-xs"
                      : "border-outline-variant/70 bg-surface-container-lowest"
                  }`}
                >
                  {/* Day Header */}
                  <div className="mb-2 pb-2 border-b border-outline-variant/40 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-on-surface block">
                        {day.weekday}
                      </span>
                      <span className="text-[11px] text-outline">
                        {day.date.getDate()}/{day.date.getMonth() + 1}
                      </span>
                    </div>
                    {day.isToday && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary text-white">
                        Nay
                      </span>
                    )}
                  </div>

                  {/* Sessions in Day */}
                  <div className="flex-1 space-y-2 mb-2 min-h-[140px]">
                    {sessions.length === 0 ? (
                      <div className="h-full flex items-center justify-center">
                        <span className="text-[11px] text-outline/60 italic">
                          Chưa có phiên
                        </span>
                      </div>
                    ) : (
                      sessions.map((session) => {
                        const isLive =
                          session.status === "LIVE" ||
                          session.status === "STARTING";
                        const isScheduled = session.status === "SCHEDULED";
                        const isEnded = session.status === "ENDED";

                        let timeLabel = "--:--";
                        if (session.scheduledAt) {
                          try {
                            timeLabel = new Date(
                              session.scheduledAt
                            ).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            });
                          } catch {
                            timeLabel = "--:--";
                          }
                        }

                        return (
                          <Link
                            key={session.id}
                            href={
                              isLive
                                ? `/admin/livestream/${session.id}/studio`
                                : `/admin/livestream/${session.id}`
                            }
                            onClick={onClose}
                            className={`block p-2 rounded-lg border text-left transition-all hover:scale-[1.02] shadow-2xs ${
                              isLive
                                ? "border-red-300 bg-red-50 text-red-900 ring-1 ring-red-400"
                                : isScheduled
                                ? "border-blue-200 bg-blue-50/60 text-blue-900"
                                : isEnded
                                ? "border-slate-200 bg-slate-50 text-slate-700"
                                : "border-outline-variant bg-surface text-on-surface"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold">
                                {isLive ? (
                                  <>
                                    <Radio className="w-3 h-3 text-red-600 animate-pulse" />
                                    <span className="text-red-600">LIVE</span>
                                  </>
                                ) : (
                                  <>
                                    <Clock className="w-3 h-3 text-outline" />
                                    <span>{timeLabel}</span>
                                  </>
                                )}
                              </span>
                              <span
                                className={`text-[9px] px-1 py-0.5 rounded font-semibold ${
                                  isLive
                                    ? "bg-red-600 text-white"
                                    : isScheduled
                                    ? "bg-blue-600 text-white"
                                    : "bg-slate-200 text-slate-700"
                                }`}
                              >
                                {isLive
                                  ? "Phát"
                                  : isScheduled
                                  ? "Lịch"
                                  : "Xong"}
                              </span>
                            </div>

                            <p
                              className="text-xs font-semibold line-clamp-2 leading-tight"
                              title={session.title}
                            >
                              {session.title}
                            </p>

                            <div className="mt-1 text-[10px] text-outline flex items-center justify-between">
                              <span>{session.productCount || 0} SP</span>
                              {isLive && (
                                <span className="font-semibold text-red-600">
                                  {session.currentViewers || 0} mắt
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      })
                    )}
                  </div>

                  {/* Day Footer Action */}
                  <Link
                    href={`/admin/livestream/create`}
                    onClick={onClose}
                    className="w-full inline-flex items-center justify-center gap-1 py-1 px-2 rounded-lg border border-dashed border-outline-variant/80 text-[11px] font-medium text-outline hover:text-primary hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <CirclePlus className="w-3 h-3" />
                    <span>Lên lịch</span>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= MODAL FOOTER ================= */}
        <footer className="px-5 py-3.5 border-t border-outline-variant/60 flex items-center justify-between bg-surface-container-low/40">
          <div className="flex items-center gap-3 text-xs text-on-surface-variant">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <span>Sắp diễn ra</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
              <span>Đang phát</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              <span>Đã hoàn thành</span>
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-outline-variant hover:bg-surface-container text-on-surface transition-colors"
            >
              Đóng
            </button>
            <Link
              href="/admin/livestream/create"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all shadow-xs"
            >
              <CirclePlus className="w-3.5 h-3.5" />
              <span>Tạo phiên Livestream mới</span>
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

