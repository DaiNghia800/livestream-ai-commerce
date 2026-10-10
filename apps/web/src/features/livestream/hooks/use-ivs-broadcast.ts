"use client";

import { useRef, useState, useCallback, useEffect } from "react";

export type BroadcastState = "IDLE" | "CONNECTING" | "LIVE" | "ERROR";

export interface StartBroadcastOptions {
  ingestEndpoint: string;
  streamKey: string;
  localStream: MediaStream;
}

export function useIvsBroadcast() {
  const [broadcastState, setBroadcastState] = useState<BroadcastState>("IDLE");
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const clientRef = useRef<any>(null);

  /**
   * Khởi tạo và bắt đầu phát sóng trực tiếp từ trình duyệt lên AWS IVS
   */
  const startBroadcast = useCallback(
    async ({ ingestEndpoint, streamKey, localStream }: StartBroadcastOptions) => {
      if (typeof window === "undefined") return;

      try {
        setBroadcastState("CONNECTING");
        setBroadcastError(null);

        // Dynamic import để tránh lỗi SSR (window is not defined) trên Next.js
        const IVS = await import("amazon-ivs-web-broadcast");

        if (!IVS.isSupported()) {
          throw new Error(
            "Trình duyệt hiện tại không hỗ trợ WebCodecs/Web Broadcast của AWS IVS."
          );
        }

        // Làm sạch Ingest Endpoint (IVS Broadcast Client nhận hostname hoặc URL sạch)
        let cleanEndpoint = ingestEndpoint.trim();
        cleanEndpoint = cleanEndpoint.replace(/^rtmps?:\/\//i, "");
        cleanEndpoint = cleanEndpoint.replace(/\/.*$/, "");
        cleanEndpoint = cleanEndpoint.replace(/:443$/, "");

        // Khởi tạo Broadcast Client với cấu hình BASIC_LANDSCAPE (chuẩn Free Tier)
        const client = IVS.create({
          streamConfig: IVS.BASIC_LANDSCAPE,
          ingestEndpoint: cleanEndpoint,
        });

        clientRef.current = client;

        // Lắng nghe sự kiện trạng thái
        client.on(
          IVS.BroadcastClientEvents.ACTIVE_STATE_CHANGE,
          ((active: boolean) => {
            if (active) {
              setBroadcastState("LIVE");
            }
          }) as any
        );

        client.on(
          IVS.BroadcastClientEvents.ERROR,
          ((err: any) => {
            console.warn("[IVS Broadcast Client Error]:", err);
            setBroadcastError(err?.message || "Lỗi đường truyền phát sóng IVS");
          }) as any
        );

        // Đưa Video Track từ Camera máy tính vào IVS
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          const videoStream = new MediaStream([videoTrack]);
          client.addVideoInputDevice(videoStream, "camera1", { index: 0 });
        }

        // Đưa Audio Track từ Micro máy tính vào IVS
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
          const audioStream = new MediaStream([audioTrack]);
          client.addAudioInputDevice(audioStream, "mic1");
        }

        // Bắt đầu đẩy luồng trực tiếp với Stream Key
        await client.startBroadcast(streamKey);
        setBroadcastState("LIVE");
      } catch (err: unknown) {
        console.warn("[useIvsBroadcast] Fallback to local streaming demo:", err);
        const errMsg =
          err instanceof Error
            ? err.message
            : "Không thể kết nối đến máy chủ AWS IVS";
        setBroadcastError(errMsg);
        setBroadcastState("ERROR");
        throw err;
      }
    },
    []
  );

  /**
   * Dừng phát sóng trực tiếp
   */
  const stopBroadcast = useCallback(() => {
    try {
      if (clientRef.current) {
        clientRef.current.stopBroadcast();
        clientRef.current = null;
      }
    } catch (err) {
      console.warn("[useIvsBroadcast] Error stopping broadcast:", err);
    } finally {
      setBroadcastState("IDLE");
    }
  }, []);

  // Cleanup khi unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        try {
          clientRef.current.stopBroadcast();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    broadcastState,
    broadcastError,
    startBroadcast,
    stopBroadcast,
    isBroadcasting: broadcastState === "LIVE",
  };
}
