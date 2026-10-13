"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  FileEdit,
  Radio,
  ShoppingBag,
  MessageSquare,
  Layers,
} from "lucide-react";
import { mockLivestreams } from "../../mocks/livestream.mock";
import { StudioSessionBar } from "./studio-session-bar";
import { StudioStreamStatus } from "./studio-stream-status";
import { StudioStreamPreview, type CameraStatus } from "./stream-preview";
import { StudioLeftSidebar } from "./studio-left-sidebar";
import { StudioDeviceControls } from "./studio-device-controls";
import { StudioBroadcastActions } from "./studio-broadcast-actions";
import { StudioPreliveChecklist } from "./studio-prelive-checklist";
import { StudioProductsPanel } from "./studio-products-panel";
import { StudioIvsConfigModal } from "./studio-ivs-config-modal";
import {
  getLivestreamDetail,
  updateLivestreamStatus,
  mapBackendLivestreamToFrontend,
  getIvsStreamConfig,
  type IvsStreamConfig,
} from "../../api/get-livestreams";
import type { StudioProductItem } from "../../types/studio";
import type { Livestream, LivestreamStatus } from "../../types/livestream";
import { useIvsBroadcast } from "../../hooks/use-ivs-broadcast";
import {
  getLivestreamProducts,
  getProductUuid,
  updateLivestreamProduct,
} from "../../api/livestream-products";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BroadcastStudioProps {
  livestreamId: string;
}

export function BroadcastStudio({ livestreamId }: BroadcastStudioProps) {
  // 1. Quản lý thông tin phiên (từ DB hoặc fallback mock)
  const [session, setSession] = useState<Livestream | null>(() => {
    return mockLivestreams.find((item) => item.id === livestreamId) || null;
  });
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(!session);

  // 2. Trạng thái phiên (DRAFT | SCHEDULED | STARTING | LIVE | ENDED)
  const [currentStatus, setCurrentStatus] = useState<LivestreamStatus>(
    session?.status || "SCHEDULED",
  );
  const [isStarting, setIsStarting] = useState(false);

  // 2.1 Cấu hình AWS IVS & Stream Key Modal
  const [isIvsModalOpen, setIsIvsModalOpen] = useState(false);
  const [ivsConfig, setIvsConfig] = useState<IvsStreamConfig | null>(null);
  const [isLoadingIvsConfig, setIsLoadingIvsConfig] = useState(false);

  // 2.2 AWS IVS Web Broadcast (Phát trực tiếp ngay trên trình duyệt web)
  const {
    broadcastState,
    startBroadcast,
    stopBroadcast,
  } = useIvsBroadcast();

  // 2.3 Điều khiển Bố cục Studio phong cách TikTok Live Studio (Đóng/Mở Sidebars)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [isTheaterMode, setIsTheaterMode] = useState(false);

  // 2.4 Cài đặt Khung hình & Hiển thị (Aspect Ratio: 16:9 PC vs 9:16 TikTok Mobile)
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [showSafezone, setShowSafezone] = useState(true);
  const [isMirrorVideo, setIsMirrorVideo] = useState(false);

  // Phím tắt điều khiển Studio: [ (toggle trái), ] (toggle phải), F (theater), Esc (thoát theater)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Bỏ qua nếu đang gõ văn bản trong input / textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.key === "[") {
        e.preventDefault();
        setIsLeftSidebarOpen((prev) => !prev);
      } else if (e.key === "]") {
        e.preventDefault();
        setIsRightSidebarOpen((prev) => !prev);
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setIsTheaterMode((prev) => {
          const next = !prev;
          if (next) {
            setIsLeftSidebarOpen(false);
            setIsRightSidebarOpen(false);
          } else {
            setIsLeftSidebarOpen(true);
            setIsRightSidebarOpen(true);
          }
          return next;
        });
      } else if (e.key === "Escape") {
        if (isTheaterMode) {
          setIsTheaterMode(false);
          setIsLeftSidebarOpen(true);
          setIsRightSidebarOpen(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTheaterMode]);

  const handleToggleTheaterMode = () => {
    setIsTheaterMode((prev) => {
      const next = !prev;
      if (next) {
        setIsLeftSidebarOpen(false);
        setIsRightSidebarOpen(false);
      } else {
        setIsLeftSidebarOpen(true);
        setIsRightSidebarOpen(true);
      }
      return next;
    });
  };

  const handleOpenIvsModal = async () => {
    setIsIvsModalOpen(true);
    if (!ivsConfig) {
      setIsLoadingIvsConfig(true);
      try {
        const conf = await getIvsStreamConfig(livestreamId);
        setIvsConfig(conf);
      } catch (err) {
        console.warn("Could not fetch IVS stream config:", err);
      } finally {
        setIsLoadingIvsConfig(false);
      }
    }
  };

  // Tải chi tiết phiên từ backend
  useEffect(() => {
    let isMounted = true;
    async function loadSessionDetail() {
      try {
        const detail = await getLivestreamDetail(livestreamId);
        if (!isMounted) return;
        const mapped = mapBackendLivestreamToFrontend(detail);
        setSession(mapped);
        setCurrentStatus(mapped.status);
      } catch (err) {
        console.warn("[Studio] Could not load session from API:", err);
      } finally {
        if (isMounted) {
          setIsLoadingSession(false);
        }
      }
    }

    loadSessionDetail();
    return () => {
      isMounted = false;
    };
  }, [livestreamId]);

  // 3. Tab di động (Stage vs Chat vs Products vs Tools)
  const [mobileTab, setMobileTab] = useState<"stage" | "products" | "chat" | "tools">("stage");

  // 4. Danh sách sản phẩm từ session
  const [allProducts, setAllProducts] = useState<StudioProductItem[]>(() => {
    const prods = session?.products || mockLivestreams[0]?.products || [];
    return prods.map((p, index) => ({
      id: p.id || `P-${index + 1}`,
      name: p.name,
      sku: p.sku,
      price: p.price,
      originalPrice: p.originalPrice,
      stock: p.stock,
      image: p.image,
      liveProductId: p.liveProductId,
      isPinned: Boolean(p.isPinned),
      orderCode: p.id,
      salesCount: p.chatOrders || 0,
    }));
  });

  const [prevProductsRef, setPrevProductsRef] = useState(session?.products);
  if (session?.products && session.products !== prevProductsRef) {
    setPrevProductsRef(session.products);
    if (session.products.length > 0) {
      setAllProducts(
        session.products.map((p, index) => ({
          id: p.id || `P-${index + 1}`,
          name: p.name,
          sku: p.sku,
          price: p.price,
          originalPrice: p.originalPrice,
          stock: p.stock,
          image: p.image,
          isPinned: Boolean(p.isPinned),
          orderCode: p.id,
          salesCount: p.chatOrders || 0,
        }))
      );
    }
  }

  // Sản phẩm đang ghim
  const [pinnedProduct, setPinnedProduct] = useState<StudioProductItem | null>(() => {
    const pinned = allProducts.find((p) => p.isPinned);
    return pinned || (allProducts.length > 0 ? allProducts[0] : null);
  });
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    if (!UUID_PATTERN.test(livestreamId)) return;
    let current = true;
    getLivestreamProducts(livestreamId)
      .then(({ data }) => {
        if (!current) return;
        const featured = data.find((item) => item.isFeatured);
        const pinned = featured
          ? allProducts.find(
              (product) =>
                getProductUuid(product.liveProductId ?? product.id) === featured.productId
            ) ?? null
          : null;
        setPinnedProduct(pinned);
        setPinError("");
      })
      .catch((error: unknown) => {
        if (!current) return;
        setPinError(
          error instanceof Error ? error.message : "Không thể tải trạng thái ghim livestream."
        );
      });
    return () => {
      current = false;
    };
  }, [allProducts, livestreamId]);

  // Danh sách sản phẩm chưa ghim
  const unpinnedProducts = useMemo(() => {
    if (!pinnedProduct) return allProducts;
    return allProducts.filter((p) => p.id !== pinnedProduct.id);
  }, [allProducts, pinnedProduct]);

  // 5. Quản lý Camera & Micro qua MediaDevices API
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [selectedMicId, setSelectedMicId] = useState<string>("");

  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    streamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Yêu cầu quyền Camera & Micro
  const handleRequestCamera = useCallback(async (videoDeviceId?: string, audioDeviceId?: string) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("not-found");
      return;
    }

    setCameraStatus("requesting");

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: videoDeviceId
          ? { deviceId: { exact: videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      setCameraStatus("active");
      setCameraEnabled(true);
      setMicEnabled(true);
    } catch (err) {
      console.warn("Could not acquire media stream:", err);
      setCameraStatus("denied");
    }
  }, []);

  // Bật/tắt camera track
  const handleToggleCamera = useCallback(() => {
    if (!localStream) {
      handleRequestCamera(selectedCameraId, selectedMicId);
      return;
    }

    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      const nextState = !videoTrack.enabled;
      videoTrack.enabled = nextState;
      setCameraEnabled(nextState);
      setCameraStatus(nextState ? "active" : "disabled");
    } else {
      handleRequestCamera(selectedCameraId, selectedMicId);
    }
  }, [localStream, selectedCameraId, selectedMicId, handleRequestCamera]);

  // Bật/tắt mic track
  const handleToggleMic = useCallback(() => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      const nextState = !audioTrack.enabled;
      audioTrack.enabled = nextState;
      setMicEnabled(nextState);
    }
  }, [localStream]);

  // Chia sẻ màn hình
  const handleToggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      handleRequestCamera(selectedCameraId, selectedMicId);
      setIsScreenSharing(false);
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      alert("Trình duyệt không hỗ trợ chia sẻ màn hình.");
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      setLocalStream(screenStream);
      setCameraStatus("active");
      setIsScreenSharing(true);

      screenStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setIsScreenSharing(false);
        handleRequestCamera(selectedCameraId, selectedMicId);
      });
    } catch (err) {
      console.warn("Screen share cancelled or failed:", err);
    }
  }, [isScreenSharing, selectedCameraId, selectedMicId, handleRequestCamera]);

  const handleCameraDeviceChange = (deviceId: string) => {
    setSelectedCameraId(deviceId);
    if (cameraStatus === "active") {
      handleRequestCamera(deviceId, selectedMicId);
    }
  };

  const handleMicDeviceChange = (deviceId: string) => {
    setSelectedMicId(deviceId);
    if (cameraStatus === "active") {
      handleRequestCamera(selectedCameraId, deviceId);
    }
  };

  // Thao tác Ghim sản phẩm
  const handlePinProduct = async (product: StudioProductItem) => {
    if (UUID_PATTERN.test(livestreamId)) {
      try {
        await updateLivestreamProduct(
          livestreamId,
          product.liveProductId ?? product.id,
          { isFeatured: true }
        );
      } catch (error) {
        setPinError(
          error instanceof Error ? error.message : "Không thể ghim sản phẩm trên livestream."
        );
        return;
      }
    }
    setPinError("");
    setPinnedProduct(product);
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_REGEX.test(livestreamId)) {
      updateLivestreamProduct(livestreamId, product.id, { isFeatured: true }).catch((err) => {
        console.warn("[Studio] Error syncing pin status to backend:", err);
      });
    }
  };

  // Thao tác Gỡ ghim
  const handleUnpinProduct = async () => {
    if (UUID_PATTERN.test(livestreamId) && pinnedProduct) {
      try {
        await updateLivestreamProduct(
          livestreamId,
          pinnedProduct.liveProductId ?? pinnedProduct.id,
          { isFeatured: false }
        );
      } catch (error) {
        setPinError(
          error instanceof Error ? error.message : "Không thể bỏ ghim sản phẩm livestream."
        );
        return;
      }
    }
    setPinError("");
    setPinnedProduct(null);
  };

  const [liveToastMessage, setLiveToastMessage] = useState<string | null>(null);

  // Bắt đầu Livestream
  const handleStartLive = async () => {
    setIsStarting(true);
    setCurrentStatus("STARTING");
    try {
      await updateLivestreamStatus(livestreamId, "live");

      let conf = ivsConfig;
      try {
        if (!conf) {
          conf = await getIvsStreamConfig(livestreamId);
          setIvsConfig(conf);
        }
      } catch (confErr) {
        console.warn("[Studio] Error fetching IVS stream config:", confErr);
      }

      let stream = localStream;
      if (!stream && typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: selectedCameraId
              ? { deviceId: { exact: selectedCameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
              : { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
          });
          setLocalStream(stream);
          setCameraStatus("active");
          setCameraEnabled(true);
          setMicEnabled(true);
        } catch (mediaErr) {
          console.warn("[Studio] Could not auto-acquire camera on start live:", mediaErr);
        }
      }

      if (stream && conf?.ingestEndpoint && conf?.streamKey) {
        try {
          await startBroadcast({
            ingestEndpoint: conf.ingestEndpoint,
            streamKey: conf.streamKey,
            localStream: stream,
          });
        } catch (streamErr) {
          console.warn("[Studio] IVS Web Broadcast connection note:", streamErr);
        }
      }

      setCurrentStatus("LIVE");
      setLiveToastMessage(
        conf?.channelArn
          ? `Đã phát sóng trực tiếp thành công lên AWS IVS!`
          : "Đã bắt đầu phát sóng phòng TikTok Live Studio!"
      );
      setTimeout(() => setLiveToastMessage(null), 6000);
    } catch (err) {
      console.warn("Failed to update status on server, falling back to local:", err);
      setCurrentStatus("LIVE");
    } finally {
      setIsStarting(false);
    }
  };

  // Kết thúc Livestream
  const handleEndLive = async () => {
    stopBroadcast();
    try {
      await updateLivestreamStatus(livestreamId, "ended");
    } catch (err) {
      console.warn("Failed to update status on server, falling back to local:", err);
    }
    setCurrentStatus("ENDED");
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
  };

  if (isLoadingSession) {
    return (
      <div className="max-w-2xl mx-auto my-16 p-12 bg-slate-900 rounded-xl border border-slate-800 text-center shadow-lg flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-300">Đang tải phòng TikTok Live Studio...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-slate-900 rounded-xl border border-slate-800 text-center shadow-lg text-slate-100">
        <div className="h-12 w-12 rounded-full bg-rose-950 text-rose-400 flex items-center justify-center mx-auto mb-4 border border-rose-800">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-white">
          Không tìm thấy phiên Livestream
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1.5 max-w-md mx-auto">
          Mã phiên <strong className="font-mono text-cyan-300">#{livestreamId}</strong> không tồn tại trong danh sách hoặc đã bị xóa.
        </p>
        <div className="mt-6">
          <Link
            href="/shop/livestream"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold rounded-lg shadow-xs transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Quay về danh sách Livestream</span>
          </Link>
        </div>
      </div>
    );
  }

  if (currentStatus === "DRAFT") {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-slate-900 rounded-xl border border-slate-800 text-center shadow-lg text-slate-100">
        <div className="h-12 w-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-4 border border-slate-700">
          <FileEdit className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 text-slate-300 border border-slate-700 rounded-full text-xs font-semibold mb-3">
          <span>PHIÊN BẢN NHÁP (DRAFT)</span>
        </div>
        <h2 className="text-lg font-bold text-white">
          Phiên chưa sẵn sàng lên sóng
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
          Phiên <strong>{session.title}</strong> hiện đang là bản nháp và chưa được cấu hình lịch phát sóng hoặc danh mục sản phẩm. Kênh phát Amazon IVS chỉ được cấp phát khi phiên được lên lịch chính thức.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/shop/livestream"
            className="px-4 py-2 bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-700 transition"
          >
            Quay về danh sách
          </Link>
          <Link
            href={`/shop/livestream/${session.id}/edit`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold rounded-lg shadow-xs transition"
          >
            <FileEdit className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Chỉnh sửa &amp; Lên lịch phiên</span>
          </Link>
        </div>
      </div>
    );
  }

  const isLive = currentStatus === "LIVE";
  const isEnded = currentStatus === "ENDED";
  const hasProducts = allProducts.length > 0;
  const cameraReady = cameraStatus === "active";
  const isMicActive = Boolean(
    localStream &&
      micEnabled &&
      localStream.getAudioTracks().some((t) => t.enabled && t.readyState === "live"),
  );
  const micReady = isMicActive;
  const canStartLive = Boolean(session.title && hasProducts && !isEnded);

  return (
    <div className="relative flex flex-col h-[calc(100dvh-104px)] min-h-[580px] lg:h-[calc(100dvh-104px)] lg:min-h-[600px] lg:max-h-[calc(100dvh-104px)] w-full rounded-xl sm:rounded-2xl border border-slate-800/90 shadow-2xl bg-[#0B0E14] text-slate-100 overflow-hidden font-sans">
      {/* Toast Notification khi Bắt đầu phát sóng */}
      {liveToastMessage && (
        <div className="absolute top-3 right-3 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          <span>{liveToastMessage}</span>
          <button
            type="button"
            onClick={() => setLiveToastMessage(null)}
            className="ml-2 hover:opacity-80 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. Top Session Bar (Session Info, Metrics, Layout Toggles) */}
      <StudioSessionBar
        sessionId={session.id}
        sessionTitle={session.title}
        status={currentStatus}
        duration={
          isLive
            ? session.subTimeDisplay?.replace("Đã live ", "") || "00:42:18"
            : isEnded
              ? session.subTimeDisplay?.replace("Thời lượng: ", "") || "03:30:00"
              : "00:00:00"
        }
        viewers={isLive ? session.currentViewers || 1940 : isEnded ? 0 : "—"}
        likesCount="18.5K"
        chatCount={isLive || isEnded ? session.chatCount || 3420 : "—"}
        aiOrdersCount={isLive || isEnded ? session.aiOrderCount || 284 : "—"}
        isLeftSidebarOpen={isLeftSidebarOpen}
        onToggleLeftSidebar={() => setIsLeftSidebarOpen((prev) => !prev)}
        isRightSidebarOpen={isRightSidebarOpen}
        onToggleRightSidebar={() => setIsRightSidebarOpen((prev) => !prev)}
        isTheaterMode={isTheaterMode}
        onToggleTheaterMode={handleToggleTheaterMode}
        className="shrink-0"
      />
      {pinError && (
        <div
          className="flex shrink-0 items-center gap-2 border-b border-rose-800 bg-rose-950/70 px-3 py-2 text-xs text-rose-200"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{pinError}</span>
        </div>
      )}

      {/* 2. Amazon IVS Stream Telemetry Header with OBS Config button */}
      <div className="flex items-center justify-between bg-[#111726] border-b border-slate-800/90 pr-3">
        <div className="flex-1 min-w-0">
          <StudioStreamStatus
            isLive={isLive}
            channelName={ivsConfig?.channelArn ? "AWS IVS ACTIVE" : session.ivsChannel}
            hasVideoSignal={cameraReady}
            broadcastState={broadcastState}
          />
        </div>
        <button
          onClick={handleOpenIvsModal}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md bg-cyan-950 text-cyan-300 border border-cyan-800/60 hover:bg-cyan-900 transition-all shrink-0 active:scale-95 shadow-xs"
        >
          <Radio className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
          <span>Cấu hình OBS / IVS</span>
        </button>
      </div>

      {/* Mobile Tab Switcher (Visible on < 1024px) */}
      <div className="lg:hidden flex items-center bg-[#111726] border-b border-slate-800 text-xs shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab("stage")}
          className={`flex-1 py-2.5 text-center font-bold flex items-center justify-center gap-1.5 transition ${
            mobileTab === "stage"
              ? "text-cyan-400 border-b-2 border-cyan-400 bg-slate-900/90"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Radio className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Khu vực Live</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("chat")}
          className={`flex-1 py-2.5 text-center font-bold flex items-center justify-center gap-1.5 transition ${
            mobileTab === "chat"
              ? "text-[#FE2C55] border-b-2 border-[#FE2C55] bg-slate-900/90"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Tin nhắn</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("products")}
          className={`flex-1 py-2.5 text-center font-bold flex items-center justify-center gap-1.5 transition ${
            mobileTab === "products"
              ? "text-amber-400 border-b-2 border-amber-400 bg-slate-900/90"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Sản phẩm ({unpinnedProducts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("tools")}
          className={`flex-1 py-2.5 text-center font-bold flex items-center justify-center gap-1.5 transition ${
            mobileTab === "tools"
              ? "text-cyan-400 border-b-2 border-cyan-400 bg-slate-900/90"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Nguồn phát</span>
        </button>
      </div>

      {/* 3. Main Studio Workspace Area (3-Column Layout with Collapsible Sidebars) */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ========================================================
            3.1 LEFT SIDEBAR: Nguồn phát & Cảnh (Sources & Scenes)
            ======================================================== */}
        <div
          className={`${
            isLeftSidebarOpen ? "w-64 xl:w-72 2xl:w-80" : "w-0 overflow-hidden border-none"
          } transition-all duration-300 ease-in-out shrink-0 ${
            mobileTab === "tools" ? "flex w-full" : "hidden lg:flex"
          }`}
        >
          <StudioLeftSidebar
            isOpen={isLeftSidebarOpen || mobileTab === "tools"}
            onToggle={() => setIsLeftSidebarOpen((prev) => !prev)}
            aspectRatio={aspectRatio}
            onChangeAspectRatio={setAspectRatio}
            showSafezone={showSafezone}
            onToggleSafezone={() => setShowSafezone((prev) => !prev)}
            selectedCameraId={selectedCameraId}
            selectedMicId={selectedMicId}
            onCameraChange={handleCameraDeviceChange}
            onMicChange={handleMicDeviceChange}
            cameraStatus={cameraStatus}
            onRequestCamera={() => handleRequestCamera(selectedCameraId, selectedMicId)}
            isScreenSharing={isScreenSharing}
            onToggleScreenShare={handleToggleScreenShare}
            isMirrorVideo={isMirrorVideo}
            onToggleMirrorVideo={() => setIsMirrorVideo((prev) => !prev)}
            isLive={isLive}
            isEnded={isEnded}
            className="w-full h-full"
          />
        </div>

        {/* ========================================================
            3.2 CENTER STAGE: Khung Livestream chính
            Tự động mở rộng 100% khi đóng 1 hoặc cả 2 sidebar!
            ======================================================== */}
        <main
          className={`flex-1 min-w-0 flex flex-col bg-[#0B0E14] overflow-hidden transition-all duration-300 ease-in-out ${
            mobileTab !== "stage" ? "hidden lg:flex" : "flex"
          }`}
          aria-label="Khu vực màn hình Livestream chính"
        >
          {/* Non-scrolling Stage Viewport */}
          <div className="flex-1 min-h-0 p-1.5 sm:p-2.5 overflow-hidden flex flex-col gap-2">
            {/* Pre-live Checklist (Chỉ xuất hiện trước khi phát LIVE) */}
            {!isLive && !isEnded && (
              <div className="shrink-0">
                <StudioPreliveChecklist
                  hasValidInfo={Boolean(session.title)}
                  hasProducts={hasProducts}
                  productsCount={allProducts.length}
                  cameraReady={cameraReady}
                  micReady={micReady}
                  livestreamId={session.id}
                  isStarting={isStarting}
                  onStartLive={handleStartLive}
                  onRequestPermissions={() => handleRequestCamera(selectedCameraId, selectedMicId)}
                />
              </div>
            )}

            {/* Video Preview Frame */}
            <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
              <StudioStreamPreview
                isLive={isLive}
                localStream={localStream}
                cameraStatus={cameraStatus}
                onRequestCamera={() => handleRequestCamera(selectedCameraId, selectedMicId)}
                pinnedProduct={pinnedProduct}
                isMicActive={isMicActive}
                isEnded={isEnded}
                aspectRatio={aspectRatio}
                onChangeAspectRatio={setAspectRatio}
                showSafezone={showSafezone}
                onToggleSafezone={() => setShowSafezone((prev) => !prev)}
                isMirrorVideo={isMirrorVideo}
                isLeftSidebarOpen={isLeftSidebarOpen}
                isRightSidebarOpen={isRightSidebarOpen}
                onToggleLeftSidebar={() => setIsLeftSidebarOpen((prev) => !prev)}
                onToggleRightSidebar={() => setIsRightSidebarOpen((prev) => !prev)}
                onToggleTheaterMode={handleToggleTheaterMode}
                isTheaterMode={isTheaterMode}
              />
            </div>
          </div>

          {/* Bottom Device Controls & Broadcast Action Bar */}
          <div className="shrink-0 bg-[#101522] border-t border-slate-800/80 px-3 py-1.5 sm:px-4 sm:py-2 flex flex-wrap items-center justify-between gap-y-1.5 gap-x-3">
            <StudioDeviceControls
              selectedCameraId={selectedCameraId}
              selectedMicId={selectedMicId}
              onCameraChange={handleCameraDeviceChange}
              onMicrophoneChange={handleMicDeviceChange}
              disabled={isEnded}
            />

            <StudioBroadcastActions
              isLive={isLive}
              isStarting={isStarting}
              isEnded={isEnded}
              canStartLive={canStartLive}
              cameraEnabled={cameraEnabled && cameraStatus === "active"}
              micEnabled={micEnabled && Boolean(localStream)}
              isScreenSharing={isScreenSharing}
              onToggleMic={handleToggleMic}
              onToggleCamera={handleToggleCamera}
              onToggleScreenShare={handleToggleScreenShare}
              onStartLive={handleStartLive}
              onEndLive={handleEndLive}
              className="basis-full 2xl:basis-auto 2xl:flex-1"
            />
          </div>
        </main>

        {/* ========================================================
            3.3 RIGHT SIDEBAR: Bán hàng & Tương tác (Sales & Chat Ops)
            Tự động gập mở mượt mà khi bấm nút
            ======================================================== */}
        <div
          className={`${
            isRightSidebarOpen
              ? "w-full lg:w-[380px] xl:w-[420px] 2xl:w-[460px]"
              : "w-0 overflow-hidden border-none"
          } transition-all duration-300 ease-in-out shrink-0 ${
            mobileTab === "stage" || mobileTab === "tools" ? "hidden lg:flex" : "flex"
          }`}
        >
          <StudioProductsPanel
            livestreamId={session.id}
            allProducts={allProducts}
            pinnedProduct={pinnedProduct}
            unpinnedProducts={unpinnedProducts}
            totalProductsCount={allProducts.length}
            onPinProduct={handlePinProduct}
            onUnpinProduct={handleUnpinProduct}
            activeTab={mobileTab === "stage" || mobileTab === "tools" ? undefined : mobileTab}
            onTabChange={(tab: "products" | "chat") => {
              if (mobileTab !== "stage" && mobileTab !== "tools") {
                setMobileTab(tab);
              }
            }}
            isEnded={isEnded}
            isExpandedMode={false}
            onCloseSidebar={() => setIsRightSidebarOpen(false)}
          />
        </div>
      </div>

      {/* Modal Cấu hình OBS / AWS IVS */}
      <StudioIvsConfigModal
        isOpen={isIvsModalOpen}
        onClose={() => setIsIvsModalOpen(false)}
        config={ivsConfig}
        isLoading={isLoadingIvsConfig}
      />
    </div>
  );
}
