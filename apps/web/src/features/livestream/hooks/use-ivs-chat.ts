"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ChatRoom, ChatMessage, ChatEvent } from "amazon-ivs-chat-messaging";
import { getIvsChatToken, isValidUuid } from "../api/get-livestreams";
import { postLivestreamComment, getLivestreamComments } from "../api/livestream-comments";
import type { StudioChatMessage } from "../types/studio";

export type IvsChatConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "ERROR";

export interface UseIvsChatOptions {
  livestreamId: string;
  userId?: string;
  username?: string;
  role?: "HOST" | "MODERATOR" | "VIEWER";
  autoConnect?: boolean;
  onMessageReceived?: (message: StudioChatMessage) => void;
}

export interface SendMessageParams {
  content: string;
  attributes?: Record<string, string>;
}

const LOCAL_CACHE_KEY_PREFIX = "liveorder_chat_cache_";
const MAX_LOCAL_CACHE = 100;

function getCachedChatMessages(livestreamId: string): StudioChatMessage[] {
  if (typeof window === "undefined" || !livestreamId) return [];
  try {
    const raw = localStorage.getItem(`${LOCAL_CACHE_KEY_PREFIX}${livestreamId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCachedChatMessages(livestreamId: string, messages: StudioChatMessage[]): void {
  if (typeof window === "undefined" || !livestreamId) return;
  try {
    // Keep most recent messages up to MAX_LOCAL_CACHE (tail of chronological list)
    const trimmed = messages.slice(-MAX_LOCAL_CACHE);
    localStorage.setItem(`${LOCAL_CACHE_KEY_PREFIX}${livestreamId}`, JSON.stringify(trimmed));
  } catch {
    // Ignore quota errors
  }
}

export function useIvsChat({
  livestreamId,
  userId = "merchant-host",
  username = "Chủ Shop LiveOrder",
  role = "HOST",
  autoConnect = true,
  onMessageReceived,
}: UseIvsChatOptions) {
  const [connectionState, setConnectionState] =
    useState<IvsChatConnectionState>("DISCONNECTED");
  const [chatMessages, setChatMessages] = useState<StudioChatMessage[]>(() => {
    return getCachedChatMessages(livestreamId);
  });
  const [chatError, setChatError] = useState<string | null>(null);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [hasMoreEarlier, setHasMoreEarlier] = useState(true);

  const roomRef = useRef<ChatRoom | null>(null);
  const isConnectingRef = useRef(false);
  const connectionStateRef = useRef<IvsChatConnectionState>(connectionState);
  const onMessageReceivedRef = useRef(onMessageReceived);
  const recentSeenRef = useRef<Map<string, number>>(new Map());
  const isManuallyDisconnectedRef = useRef(false);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const connectRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    setChatMessages(getCachedChatMessages(livestreamId));
    recentSeenRef.current.clear();
  }, [livestreamId]);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    onMessageReceivedRef.current = onMessageReceived;
  }, [onMessageReceived]);

  /**
   * 2. Đồng bộ lịch sử bình luận từ Redis Cache / Backend khi load lại trang
   * Host lấy 100 tin gần nhất; Viewer lấy 50 tin gần nhất (chuẩn TikTok).
   * Lịch sử được trả về theo thứ tự thời gian tăng dần [cũ nhất -> mới nhất].
   */
  useEffect(() => {
    if (!livestreamId || !isValidUuid(livestreamId)) return;

    let isMounted = true;
    const fetchLimit = role === "HOST" ? 100 : 50;

    getLivestreamComments(livestreamId, { limit: fetchLimit })
      .then((historicalMsgs) => {
        if (!isMounted) return;
        if (historicalMsgs.length < fetchLimit) {
          setHasMoreEarlier(false);
        }

        // historicalMsgs đã ở thứ tự thời gian [cũ nhất -> mới nhất]
        const chronological = historicalMsgs;

        setChatMessages((prev) => {
          const mapById = new Map<string, StudioChatMessage>();
          const seenFingerprints = new Set<string>();

          // 1. Dữ liệu từ Server (Redis/DB) là Nguồn Chân Lý (Source of Truth)
          chronological.forEach((m) => {
            mapById.set(m.id, m);
            const fp = `${m.userId || "anon"}:${m.content.trim().toLowerCase()}`;
            seenFingerprints.add(fp);
          });

          // 2. Chỉ giữ lại các tin local chưa kịp đồng bộ nếu chưa tồn tại trên server (loại bỏ duplicate)
          prev.forEach((m) => {
            const fp = `${m.userId || "anon"}:${m.content.trim().toLowerCase()}`;
            if (!mapById.has(m.id) && !seenFingerprints.has(fp)) {
              mapById.set(m.id, m);
              seenFingerprints.add(fp);
            }
          });

          const merged = Array.from(mapById.values());
          saveCachedChatMessages(livestreamId, merged);
          return merged;
        });

        // Đánh dấu vào cache recentSeen để tránh hiển thị trùng nếu IVS phát lại
        const now = Date.now();
        chronological.forEach((msg) => {
          const key = `${msg.userId || "anon"}:${msg.content.trim().toLowerCase()}`;
          recentSeenRef.current.set(key, now);
        });
      })
      .catch((err) => {
        console.warn("[useIvsChat] Failed to load initial comment history:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [livestreamId, role]);

  /**
   * Tải tiếp các tin nhắn cũ hơn khi người dùng cuộn lên trên xem lịch sử
   */
  const loadEarlierMessages = useCallback(async () => {
    if (!livestreamId || !isValidUuid(livestreamId)) return;
    if (isLoadingEarlier || !hasMoreEarlier) return;

    // Tin nhắn cũ nhất hiện tại nằm ở đầu mảng (index 0)
    const oldestMsg = chatMessages[0];
    if (!oldestMsg || !oldestMsg.createdAt) {
      setHasMoreEarlier(false);
      return;
    }

    setIsLoadingEarlier(true);
    try {
      const olderMsgs = await getLivestreamComments(livestreamId, {
        limit: 20,
        before: oldestMsg.createdAt,
      });

      if (olderMsgs.length < 20) {
        setHasMoreEarlier(false);
      }

      if (olderMsgs.length > 0) {
        setChatMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const uniqueOlder = olderMsgs.filter((m) => !existingIds.has(m.id));
          // Chèn các tin cũ hơn lên đầu danh sách
          const updated = [...uniqueOlder, ...prev];
          saveCachedChatMessages(livestreamId, updated);
          return updated;
        });
      }
    } catch (err) {
      console.warn("[useIvsChat] Failed to load earlier comments:", err);
    } finally {
      setIsLoadingEarlier(false);
    }
  }, [livestreamId, isLoadingEarlier, hasMoreEarlier, chatMessages]);

  /**
   * Kiểm tra tin nhắn trùng lặp (cùng người gửi + nội dung trong vòng 4s)
   * Ngăn hiện tượng nhân đôi tin nhắn giữa WebSocket message và REST event broadcast
   */
  const isDuplicateMessage = useCallback((msg: StudioChatMessage): boolean => {
    const now = Date.now();
    const map = recentSeenRef.current;

    // Dọn dẹp cache cũ hơn 10 giây
    for (const [key, timestamp] of map.entries()) {
      if (now - timestamp > 10000) {
        map.delete(key);
      }
    }

    const key = `${msg.userId || "anon"}:${msg.content.trim().toLowerCase()}`;
    const lastSeen = map.get(key);
    if (lastSeen && now - lastSeen < 4000) {
      return true;
    }

    map.set(key, now);
    return false;
  }, []);

  /**
   * Kết nối vào IVS Chat Room qua WebSocket
   */
  const connect = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!livestreamId) return;
    if (isConnectingRef.current || connectionStateRef.current === "CONNECTED") return;

    isManuallyDisconnectedRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Nếu ID không phải UUID hợp lệ (mock session như LIVE-2025-08 hoặc preview demo):
    // Hoạt động ở chế độ Local Mock Chat để không phát sinh ngoại lệ console
    if (!isValidUuid(livestreamId)) {
      setConnectionState("CONNECTED");
      return;
    }

    try {
      isConnectingRef.current = true;
      setConnectionState("CONNECTING");
      setChatError(null);

      // Thử lấy token trước để kiểm tra kết nối tới commerce service
      let initialToken;
      try {
        initialToken = await getIvsChatToken(livestreamId, {
          userId,
          username,
          role,
        });
      } catch {
        // Backend offline hoặc chưa có phòng chat -> fallback sang local chat
        setConnectionState("CONNECTED");
        isConnectingRef.current = false;
        return;
      }

      // 1. Dynamic import amazon-ivs-chat-messaging để tránh SSR error
      const { ChatRoom } = await import("amazon-ivs-chat-messaging");

      // 2. Khởi tạo ChatRoom instance với tokenProvider
      const room = new ChatRoom({
        maxReconnectAttempts: 3,
        regionOrUrl: process.env.NEXT_PUBLIC_AWS_IVS_REGION || "ap-northeast-1",
        tokenProvider: async () => {
          try {
            const res = await getIvsChatToken(livestreamId, {
              userId,
              username,
              role,
            });

            return {
              token: res.token,
              sessionExpirationTime: res.sessionExpirationTime
                ? new Date(res.sessionExpirationTime)
                : undefined,
              tokenExpirationTime: res.tokenExpirationTime
                ? new Date(res.tokenExpirationTime)
                : undefined,
            };
          } catch {
            return {
              token: initialToken.token,
            };
          }
        },
      });

      // 3. Đăng ký các listeners
      room.addListener("connect", () => {
        setConnectionState("CONNECTED");
        isConnectingRef.current = false;
      });

      room.addListener("connecting", () => {
        setConnectionState("CONNECTING");
      });

      room.addListener("disconnect", () => {
        setConnectionState("DISCONNECTED");
        isConnectingRef.current = false;

        // Tự động kết nối lại sau 3s nếu autoConnect bật và không phải do unmount/ngắt thủ công
        if (autoConnect && !isManuallyDisconnectedRef.current) {
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            if (!isManuallyDisconnectedRef.current && connectionStateRef.current !== "CONNECTED") {
              console.log("[useIvsChat] Tự động thử kết nối lại IVS Chat sau ngắt kết nối...");
              void connectRef.current?.();
            }
          }, 3000);
        }
      });

      room.addListener("message", (msg: ChatMessage) => {
        const timestamp = msg.sendTime
          ? new Date(msg.sendTime).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          })
          : new Date().toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          });

        const studioMsg: StudioChatMessage = {
          id: msg.id || `msg-${Date.now()}-${Math.random()}`,
          userId: msg.sender?.userId || "anonymous",
          userName:
            msg.sender?.attributes?.username ||
            msg.sender?.userId ||
            "Người xem",
          userAvatar: msg.sender?.attributes?.avatarUrl,
          content: msg.content || "",
          timestamp,
          status: msg.attributes?.orderStatus as StudioChatMessage["status"],
        };

        if (isDuplicateMessage(studioMsg)) {
          return;
        }

        setChatMessages((prev) => {
          if (prev.some((m) => m.id === studioMsg.id)) {
            return prev;
          }

          // Thay thế tin nhắn tạm local (nếu có) bằng tin nhắn thực từ IVS
          const fp = `${studioMsg.userId || "anon"}:${studioMsg.content.trim().toLowerCase()}`;
          const hasLocalOptimistic = prev.some(
            (m) =>
              (m.id.startsWith("local-") || m.id.startsWith("msg-")) &&
              `${m.userId || "anon"}:${m.content.trim().toLowerCase()}` === fp
          );

          let updated: StudioChatMessage[];
          if (hasLocalOptimistic) {
            updated = prev.map((m) =>
              (m.id.startsWith("local-") || m.id.startsWith("msg-")) &&
              `${m.userId || "anon"}:${m.content.trim().toLowerCase()}` === fp
                ? studioMsg
                : m
            );
          } else {
            // Thứ tự tự nhiên: tin nhắn mới được THÊM VÀO CUỐI MẢNG
            updated = [...prev, studioMsg];
          }

          saveCachedChatMessages(livestreamId, updated);
          return updated;
        });
        onMessageReceivedRef.current?.(studioMsg);
      });

      // Bắt custom event "app:comment" được broadcast từ REST API (ví dụ: Postman hoặc API khách xem)
      room.addListener("event", (evt: ChatEvent) => {
        if (evt.eventName === "app:comment" && evt.attributes) {
          const timestamp = evt.sendTime
            ? new Date(evt.sendTime).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })
            : new Date().toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            });

          const studioMsg: StudioChatMessage = {
            id: evt.attributes.id || evt.id || `evt-${Date.now()}`,
            userId: evt.attributes.userId || "anonymous",
            userName:
              evt.attributes.username ||
              evt.attributes.userName ||
              "Người xem",
            userAvatar: evt.attributes.avatarUrl || undefined,
            content: evt.attributes.content || "",
            timestamp,
            badge:
              evt.attributes.role === "host"
                ? "Chủ shop"
                : evt.attributes.role === "moderator"
                  ? "Quản trị viên"
                  : undefined,
            status: evt.attributes.orderStatus as StudioChatMessage["status"],
          };

          if (isDuplicateMessage(studioMsg)) {
            return;
          }

          setChatMessages((prev) => {
            if (prev.some((m) => m.id === studioMsg.id)) {
              return prev;
            }

            // Thay thế tin nhắn tạm local nếu trùng khớp nội dung
            const fp = `${studioMsg.userId || "anon"}:${studioMsg.content.trim().toLowerCase()}`;
            const hasLocalOptimistic = prev.some(
              (m) =>
                (m.id.startsWith("local-") || m.id.startsWith("msg-")) &&
                `${m.userId || "anon"}:${m.content.trim().toLowerCase()}` === fp
            );

            let updated: StudioChatMessage[];
            if (hasLocalOptimistic) {
              updated = prev.map((m) =>
                (m.id.startsWith("local-") || m.id.startsWith("msg-")) &&
                `${m.userId || "anon"}:${m.content.trim().toLowerCase()}` === fp
                  ? studioMsg
                  : m
              );
            } else {
              // Thứ tự tự nhiên: tin nhắn mới được THÊM VÀO CUỐI MẢNG
              updated = [...prev, studioMsg];
            }

            saveCachedChatMessages(livestreamId, updated);
            return updated;
          });
          onMessageReceivedRef.current?.(studioMsg);
        }
      });

      roomRef.current = room;

      // 4. Bắt đầu kết nối
      await room.connect();
    } catch {
      // Fallback về trạng thái CONNECTED cục bộ nếu kết nối websocket AWS thất bại
      setConnectionState("CONNECTED");
      isConnectingRef.current = false;
    }
  }, [livestreamId, userId, username, role, isDuplicateMessage, autoConnect]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  /**
   * Ngắt kết nối phòng chat
   */
  const disconnect = useCallback(() => {
    isManuallyDisconnectedRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch (err) {
        console.warn("[useIvsChat] Error disconnecting:", err);
      }
      roomRef.current = null;
    }
    setConnectionState("DISCONNECTED");
    isConnectingRef.current = false;
  }, []);

  /**
   * Gửi tin nhắn vào IVS Chat Room & đồng bộ Redis Cache
   * TikTok-style: comments are ephemeral, cached in Redis and only persisted via SQS if AI purchase intent is detected.
   */
  const sendMessage = useCallback(
    async (content: string, attributes?: Record<string, string>) => {
      const cleanContent = content.trim();
      if (!cleanContent) return;

      // 1. Lưu vào Redis Cache (và đẩy SQS nếu là buyer có tín hiệu mua)
      if (isValidUuid(livestreamId)) {
        void postLivestreamComment(livestreamId, {
          userId,
          username,
          content: cleanContent,
          role: role === "HOST" ? "host" : role === "MODERATOR" ? "moderator" : "buyer",
          skipIvsBroadcast: true,
        });
      }

      // 2. Nếu đang kết nối với IVS room thật
      if (roomRef.current && connectionStateRef.current === "CONNECTED") {
        try {
          const { SendMessageRequest } = await import(
            "amazon-ivs-chat-messaging"
          );
          const req = new SendMessageRequest(cleanContent, attributes);

          // Khống chế timeout 3.5 giây để không bị treo Promise khi rớt mạng
          const sendPromise = roomRef.current.sendMessage(req);
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error("IVS sendMessage timeout (3500ms)")),
              3500
            );
          });
          await Promise.race([sendPromise, timeoutPromise]);
          return;
        } catch (err) {
          console.warn(
            "[useIvsChat] Error sending to IVS (fallback sang hiển thị local):",
            err
          );
        }
      }

      // Local / Offline fallback: Tự tạo tin nhắn hiển thị ngay lập tức (thêm vào cuối mảng)
      const localMsg: StudioChatMessage = {
        id: `local-${Date.now()}`,
        userId,
        userName: username,
        badge: role === "HOST" ? "Chủ shop" : undefined,
        content: cleanContent,
        timestamp: new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setChatMessages((prev) => {
        const updated = [...prev, localMsg];
        saveCachedChatMessages(livestreamId, updated);
        return updated;
      });
      onMessageReceivedRef.current?.(localMsg);
    },
    [livestreamId, userId, username, role]
  );

  useEffect(() => {
    let isCancelled = false;

    if (autoConnect && livestreamId) {
      const timer = setTimeout(() => {
        if (!isCancelled) {
          void connect();
        }
      }, 0);

      return () => {
        isCancelled = true;
        clearTimeout(timer);
        disconnect();
      };
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, livestreamId, connect, disconnect]);

  // Tự động hồi sinh kết nối khi trình duyệt phát hiện có mạng Internet trở lại
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      console.log("[useIvsChat] Trình duyệt có mạng trở lại (Online event)");
      if (autoConnect && livestreamId && connectionStateRef.current !== "CONNECTED") {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        isManuallyDisconnectedRef.current = false;
        void connect();
      }
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [autoConnect, livestreamId, connect]);

  return {
    connectionState,
    chatMessages,
    chatError,
    isLoadingEarlier,
    hasMoreEarlier,
    loadEarlierMessages,
    connect,
    disconnect,
    sendMessage,
  };
}
