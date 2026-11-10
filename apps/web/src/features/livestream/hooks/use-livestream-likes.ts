"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const REALTIME_API_URL =
  process.env.NEXT_PUBLIC_REALTIME_API_URL || "http://localhost:3002";

export interface LivestreamLikesHookResult {
  /** Tổng số lượt tim hiện tại của livestream */
  likesCount: number;
  /** Hàm gửi lượt thả tim (mặc định +1 hoặc gom nhiều lượt) */
  sendLike: (count?: number) => void;
  /** Trạng thái kết nối realtime */
  isConnected: boolean;
}

/**
 * Hook quản lý thả tim livestream (Live Hearts Batching):
 * - Optimistic UI: Tăng ngay lập tức trên giao diện khi người dùng bấm tim liên tục.
 * - Client-side Batching: Gom tất cả các lượt bấm trong 1.5 giây gửi 1 request duy nhất (tránh spam HTTP flood).
 * - Periodic Sync: Đồng bộ số tim từ server định kỳ (mỗi 5s).
 * - Keepalive Flush: Đảm bảo tim chưa gửi kịp khi tắt tab/rời trang được gửi đi an toàn qua sendBeacon / fetch keepalive.
 */
export function useLivestreamLikes(
  livestreamId?: string,
  isLive = false,
  pollIntervalMs = 5000,
  batchDelayMs = 1500
): LivestreamLikesHookResult {
  const [likesCount, setLikesCount] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const pendingLikesRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const livestreamIdRef = useRef<string | undefined>(livestreamId);

  useEffect(() => {
    livestreamIdRef.current = livestreamId;
  }, [livestreamId]);

  // 1. Flush lượt tim đang gom tới Realtime Service
  const flushLikes = useCallback(async () => {
    const currentLiveId = livestreamIdRef.current;
    const countToSend = pendingLikesRef.current;
    if (!currentLiveId || countToSend <= 0) return;

    // Reset pending counter trước khi gửi để gom các lượt bấm mới
    pendingLikesRef.current = 0;

    try {
      const response = await fetch(
        `${REALTIME_API_URL}/api/v1/realtime/livestreams/${encodeURIComponent(currentLiveId)}/likes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: countToSend }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (typeof data.likesCount === "number") {
          setLikesCount((prev) => Math.max(prev, data.likesCount));
        }
        setIsConnected(true);
      }
    } catch {
      // Offline fallback: Không crash UI
      setIsConnected(false);
    }
  }, []);

  // 2. Fetch số tim hiện tại từ server
  const fetchLikes = useCallback(async () => {
    const currentLiveId = livestreamIdRef.current;
    if (!currentLiveId) return;

    try {
      const response = await fetch(
        `${REALTIME_API_URL}/api/v1/realtime/livestreams/${encodeURIComponent(currentLiveId)}/likes`
      );

      if (response.ok) {
        const data = await response.json();
        if (typeof data.likesCount === "number") {
          setLikesCount((prev) => Math.max(prev, data.likesCount));
        }
        setIsConnected(true);
      }
    } catch {
      setIsConnected(false);
    }
  }, []);

  // 3. Hàm user trigger khi bấm thả tim
  const sendLike = useCallback(
    (count = 1) => {
      const safeCount = Math.max(1, Math.min(50, Math.floor(count)));
      // Optimistic increment
      setLikesCount((prev) => prev + safeCount);
      pendingLikesRef.current += safeCount;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        flushLikes();
      }, batchDelayMs);
    },
    [batchDelayMs, flushLikes]
  );

  // 4. Send remaining likes on tab close / unmount
  const sendUnloadLikes = useCallback(() => {
    const currentLiveId = livestreamIdRef.current;
    const countToSend = pendingLikesRef.current;
    if (!currentLiveId || countToSend <= 0) return;

    pendingLikesRef.current = 0;
    const url = `${REALTIME_API_URL}/api/v1/realtime/livestreams/${encodeURIComponent(currentLiveId)}/likes`;
    const payload = JSON.stringify({ count: countToSend });

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

  // 5. Chu kỳ sync & lifecycle listeners
  useEffect(() => {
    if (!livestreamId || !isLive) {
      return;
    }

    // Fetch số tim lần đầu
    fetchLikes();

    // Poll định kỳ để cập nhật tim từ người xem khác
    const interval = setInterval(fetchLikes, pollIntervalMs);

    const handleUnload = () => {
      sendUnloadLikes();
    };

    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);

    return () => {
      clearInterval(interval);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
      sendUnloadLikes();
    };
  }, [livestreamId, isLive, pollIntervalMs, fetchLikes, sendUnloadLikes]);

  return {
    likesCount,
    sendLike,
    isConnected,
  };
}

