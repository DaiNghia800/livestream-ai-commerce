"use client";

import { useRef, useState, useCallback, useEffect } from "react";

export type BroadcastState = "IDLE" | "CONNECTING" | "LIVE" | "ERROR";

export interface StartBroadcastOptions {
  ingestEndpoint: string;
  streamKey: string;
  localStream: MediaStream;
}

interface BroadcastClientInstance {
  stopBroadcast: () => void;
  startBroadcast: (key: string) => Promise<void>;
  addVideoInputDevice: (stream: MediaStream, name: string, options?: { index: number }) => void;
  addAudioInputDevice: (stream: MediaStream, name: string) => void;
  getConnectionState?: () => string;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off?: (event: string, callback: (...args: unknown[]) => void) => void;
}

export function useIvsBroadcast() {
  const [broadcastState, setBroadcastState] = useState<BroadcastState>("IDLE");
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectNotice, setReconnectNotice] = useState<string | null>(null);

  const clientRef = useRef<BroadcastClientInstance | null>(null);
  const isBroadcastingRef = useRef<boolean>(false);
  const lastOptionsRef = useRef<StartBroadcastOptions | null>(null);

  /**
   * Khởi tạo và bắt đầu phát sóng trực tiếp từ trình duyệt lên AWS IVS
   */
  const startBroadcast = useCallback(
    async ({ ingestEndpoint, streamKey, localStream }: StartBroadcastOptions) => {
      if (typeof window === "undefined") return;

      try {
        setBroadcastState("CONNECTING");
        setBroadcastError(null);

        // Lưu options để phục vụ tự động khôi phục kết nối khi chuyển tab
        lastOptionsRef.current = { ingestEndpoint, streamKey, localStream };

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

        console.log("[useIvsBroadcast] Initializing IVS Broadcast Client with endpoint:", cleanEndpoint);

        // Khởi tạo Broadcast Client với cấu hình BASIC_LANDSCAPE & networkReconnectConfig
        const client = IVS.create({
          streamConfig: IVS.BASIC_LANDSCAPE,
          ingestEndpoint: cleanEndpoint,
          networkReconnectConfig: {
            reconnect: true,
          },
        }) as unknown as BroadcastClientInstance;

        clientRef.current = client;

        // Lắng nghe sự kiện trạng thái phát sóng
        client.on(
          IVS.BroadcastClientEvents.ACTIVE_STATE_CHANGE,
          (active: unknown) => {
            console.log("[useIvsBroadcast] ACTIVE_STATE_CHANGE:", active);
            if (active) {
              setBroadcastState("LIVE");
              setIsReconnecting(false);
            }
          }
        );

        // Lắng nghe sự kiện trạng thái kết nối WebRTC (ConnectionState)
        client.on(
          IVS.BroadcastClientEvents.CONNECTION_STATE_CHANGE,
          (state: unknown) => {
            console.log("[useIvsBroadcast] CONNECTION_STATE_CHANGE:", state);
            const s = String(state).toLowerCase();
            if (s === "connected") {
              setBroadcastState("LIVE");
              setIsReconnecting(false);
            } else if (s === "connecting") {
              setBroadcastState((prev) => (prev === "LIVE" ? prev : "CONNECTING"));
            } else if (s === "disconnected" || s === "failed") {
              if (isBroadcastingRef.current) {
                setIsReconnecting(true);
              }
            }
          }
        );

        client.on(
          IVS.BroadcastClientEvents.ERROR,
          (err: unknown) => {
            console.warn("[IVS Broadcast Client Error]:", err);
            const message =
              err instanceof Error
                ? err.message
                : typeof err === "object" && err !== null && "message" in err
                ? String((err as { message: unknown }).message)
                : "Lỗi đường truyền phát sóng IVS";
            setBroadcastError(message);
          }
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
        console.log("[useIvsBroadcast] Starting stream to AWS IVS Ingest with Stream Key...");
        await client.startBroadcast(streamKey);
        console.log("[useIvsBroadcast] Broadcast successfully transmitted to AWS IVS!");
        isBroadcastingRef.current = true;
        setBroadcastState("LIVE");
      } catch (err: unknown) {
        console.warn("[useIvsBroadcast] Fallback to local streaming demo:", err);
        const errMsg =
          err instanceof Error
            ? err.message
            : "Không thể kết nối đến máy chủ AWS IVS";
        setBroadcastError(errMsg);
        setBroadcastState("ERROR");
        isBroadcastingRef.current = false;
        throw err;
      }
    },
    []
  );

  /**
   * Dừng phát sóng trực tiếp
   */
  const stopBroadcast = useCallback(() => {
    isBroadcastingRef.current = false;
    lastOptionsRef.current = null;
    setIsReconnecting(false);
    setReconnectNotice(null);

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

  /**
   * Tự động phát hiện và khôi phục luồng khi người dùng chuyển lại tab Studio
   */
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;

      // Chỉ xử lý nếu phiên đang trong trạng thái phải phát sóng
      if (!isBroadcastingRef.current || !lastOptionsRef.current) return;

      const client = clientRef.current;
      const connState = client?.getConnectionState?.()?.toLowerCase();

      // Nếu kết nối bị trình duyệt làm đứt hoặc timeout do chạy ngầm
      if (
        !connState ||
        connState === "closed" ||
        connState === "failed" ||
        connState === "idle" ||
        connState === "disconnected"
      ) {
        console.log("[useIvsBroadcast] Tab visible again, recovering stream dropped during background throttling...");
        setIsReconnecting(true);
        setReconnectNotice("Đang tự động khôi phục luồng phát sau khi chuyển tab...");

        try {
          // Bật lại các track nếu bị trình duyệt tạm dừng
          const currentStream = lastOptionsRef.current.localStream;
          if (currentStream) {
            currentStream.getTracks().forEach((track) => {
              if (!track.enabled) track.enabled = true;
            });
          }

          // Khởi động lại luồng phát
          await startBroadcast(lastOptionsRef.current);
          setBroadcastState("LIVE");
          setReconnectNotice("Đã khôi phục luồng phát AWS IVS thành công!");
          setTimeout(() => setReconnectNotice(null), 4000);
        } catch (recoverErr) {
          console.warn("[useIvsBroadcast] Auto-recovery failed:", recoverErr);
          setReconnectNotice("Không thể tự động khôi phục luồng phát. Vui lòng thử lại.");
          setTimeout(() => setReconnectNotice(null), 5000);
        } finally {
          setIsReconnecting(false);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [startBroadcast]);

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
    isReconnecting,
    reconnectNotice,
  };
}
