"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const REALTIME_API_URL =
  process.env.NEXT_PUBLIC_REALTIME_API_URL || "http://localhost:3002";

export interface LivestreamViewersHookResult {
  /** Số mắt xem trực tiếp hiện tại */
  viewerCount: number;
  /** Kỷ lục mắt xem cao nhất của phiên */
  peakViewers: number;
  /** Trạng thái kết nối tới realtime service */
  isConnected: boolean;
  /** Định danh duy nhất của viewer này trong phiên */
  viewerId: string;
}

/**
 * Hook quản lý mắt xem livestream realtime (Redis Sliding Window presence).
 * - Tự động gửi heartbeat định kỳ mỗi 10-12s khi phiên live đang diễn ra.
 * - Tự động gửi tín hiệu leave để giảm mắt xem tức thì khi người dùng tắt tab hoặc unmount.
 * - Khả năng chịu lỗi: Nếu realtime service chưa bật, UI vẫn hoạt động mượt mà không crash.
 */
export function useLivestreamViewers(
  livestreamId?: string,
  isLive = false,
  heartbeatIntervalMs = 10000
): LivestreamViewersHookResult {
  const [viewerCount, setViewerCount] = useState<number>(isLive ? 1 : 0);
  const [peakViewers, setPeakViewers] = useState<number>(isLive ? 1 : 0);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [viewerId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    let id = sessionStorage.getItem("live_viewer_id");
    if (!id) {
      id = `viewer-${Math.random().toString(36).substring(2, 11)}-${Date.now().toString(36)}`;
      sessionStorage.setItem("live_viewer_id", id);
    }
    return id;
  });

  // Ref lưu viewerId và livestreamId để dùng an toàn trong event listeners
  const viewerIdRef = useRef<string>(viewerId);
  const livestreamIdRef = useRef<string | undefined>(livestreamId);

  useEffect(() => {
    livestreamIdRef.current = livestreamId;
  }, [livestreamId]);

  useEffect(() => {
    viewerIdRef.current = viewerId;
  }, [viewerId]);

  // 2. Gửi heartbeat
  const sendHeartbeat = useCallback(async () => {
    const currentLiveId = livestreamIdRef.current;
    const currentViewerId = viewerIdRef.current;
    if (!currentLiveId || !currentViewerId) return;

    try {
      const response = await fetch(
        `${REALTIME_API_URL}/api/v1/realtime/livestreams/${encodeURIComponent(currentLiveId)}/heartbeat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ viewerId: currentViewerId }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (typeof data.viewerCount === "number") {
          setViewerCount(data.viewerCount);
        }
        if (typeof data.peakViewers === "number") {
          setPeakViewers(data.peakViewers);
        }
        setIsConnected(true);
      }
    } catch {
      // Graceful fallback: Khi realtime service offline, không ném lỗi làm crash UI
      setIsConnected(false);
    }
  }, []);

  // 3. Gửi leave signal khi tắt tab hoặc rời trang
  const sendLeaveSignal = useCallback(() => {
    const currentLiveId = livestreamIdRef.current;
    const currentViewerId = viewerIdRef.current;
    if (!currentLiveId || !currentViewerId) return;

    const url = `${REALTIME_API_URL}/api/v1/realtime/livestreams/${encodeURIComponent(currentLiveId)}/leave`;
    const payload = JSON.stringify({ viewerId: currentViewerId });

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(url, blob);
    } else if (typeof fetch !== "undefined") {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }, []);

  // 4. Quản lý chu kỳ ping & dọn dẹp
  useEffect(() => {
    if (!livestreamId || !isLive) {
      return;
    }

    // Ping lần đầu ngay khi vào live
    sendHeartbeat();

    // Định kỳ gửi heartbeat
    const interval = setInterval(sendHeartbeat, heartbeatIntervalMs);

    // Lắng nghe sự kiện tắt tab / chuyển trang
    const handleUnload = () => {
      sendLeaveSignal();
    };

    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
      sendLeaveSignal();
    };
  }, [livestreamId, isLive, heartbeatIntervalMs, sendHeartbeat, sendLeaveSignal]);

  return {
    viewerCount,
    peakViewers,
    isConnected,
    viewerId,
  };
}

