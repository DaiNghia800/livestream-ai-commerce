"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ChatRoom, ChatMessage } from "amazon-ivs-chat-messaging";
import { getIvsChatToken, isValidUuid } from "../api/get-livestreams";
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
  const [chatMessages, setChatMessages] = useState<StudioChatMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);

  const roomRef = useRef<ChatRoom | null>(null);
  const isConnectingRef = useRef(false);
  const connectionStateRef = useRef<IvsChatConnectionState>(connectionState);
  const onMessageReceivedRef = useRef(onMessageReceived);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    onMessageReceivedRef.current = onMessageReceived;
  }, [onMessageReceived]);

  /**
   * Kết nối vào IVS Chat Room qua WebSocket
   */
  const connect = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!livestreamId) return;
    if (isConnectingRef.current || connectionStateRef.current === "CONNECTED") return;

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

        setChatMessages((prev) => [studioMsg, ...prev]);
        onMessageReceivedRef.current?.(studioMsg);
      });

      roomRef.current = room;

      // 4. Bắt đầu kết nối
      await room.connect();
    } catch {
      // Fallback về trạng thái CONNECTED cục bộ nếu kết nối websocket AWS thất bại
      setConnectionState("CONNECTED");
      isConnectingRef.current = false;
    }
  }, [livestreamId, userId, username, role]);

  /**
   * Ngắt kết nối phòng chat
   */
  const disconnect = useCallback(() => {
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
   * Gửi tin nhắn vào IVS Chat Room
   */
  const sendMessage = useCallback(
    async (content: string, attributes?: Record<string, string>) => {
      const cleanContent = content.trim();
      if (!cleanContent) return;

      // Nếu đang kết nối với IVS room thật
      if (roomRef.current && connectionStateRef.current === "CONNECTED") {
        try {
          const { SendMessageRequest } = await import(
            "amazon-ivs-chat-messaging"
          );
          const req = new SendMessageRequest(cleanContent, attributes);
          await roomRef.current.sendMessage(req);
          return;
        } catch (err) {
          console.warn("[useIvsChat] Error sending to IVS:", err);
        }
      }

      // Local / Offline fallback: Tự tạo tin nhắn hiển thị ngay lập tức
      const localMsg: StudioChatMessage = {
        id: `local-${Date.now()}`,
        userId,
        userName: username,
        content: cleanContent,
        timestamp: new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setChatMessages((prev) => [localMsg, ...prev]);
      onMessageReceivedRef.current?.(localMsg);
    },
    [userId, username]
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

  return {
    connectionState,
    chatMessages,
    chatError,
    connect,
    disconnect,
    sendMessage,
  };
}
