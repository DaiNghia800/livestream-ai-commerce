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
} from "lucide-react";
import { mockLivestreams } from "../../mocks/livestream.mock";
import { StudioSessionBar } from "./studio-session-bar";
import { StudioStreamStatus } from "./studio-stream-status";
import { StudioStreamPreview, type CameraStatus } from "./stream-preview";
import { StudioDeviceControls } from "./studio-device-controls";
import { StudioBroadcastActions } from "./studio-broadcast-actions";
import { StudioPreliveChecklist } from "./studio-prelive-checklist";
import { StudioProductsPanel } from "./studio-products-panel";
import type { StudioProductItem } from "../../types/studio";
import type { LivestreamStatus } from "../../types/livestream";

export interface BroadcastStudioProps {
  livestreamId: string;
}

export function BroadcastStudio({ livestreamId }: BroadcastStudioProps) {
  // 1. Lấy thông tin phiên từ mockLivestreams
  const session = mockLivestreams.find((item) => item.id === livestreamId);

  // 2. Trạng thái phiên (DRAFT | SCHEDULED | STARTING | LIVE | ENDED)
  const [currentStatus, setCurrentStatus] = useState<LivestreamStatus>(
    session?.status || "SCHEDULED",
  );
  const [isStarting, setIsStarting] = useState(false);

  // 3. Tab di động (Stage vs Products/Chat)
  const [mobileTab, setMobileTab] = useState<"stage" | "products" | "chat">("stage");

  // 4. Danh sách sản phẩm từ session
  const [allProducts] = useState<StudioProductItem[]>(() => {
    if (!session?.products) return [];
    return session.products.map((p, index) => ({
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
    }));
  });

  // Sản phẩm đang ghim
  const [pinnedProduct, setPinnedProduct] = useState<StudioProductItem | null>(() => {
    const pinned = allProducts.find((p) => p.isPinned);
    return pinned || (allProducts.length > 0 ? allProducts[0] : null);
  });

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

  // 6. Chế độ mở rộng vùng điều hành bán hàng (Focus / Expanded Operations Mode)
  const [isExpandedWorkspace, setIsExpandedWorkspace] = useState(false);

  // Phím Escape để nhanh chóng thu gọn về bố cục bình thường
  useEffect(() => {
    if (!isExpandedWorkspace) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsExpandedWorkspace(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpandedWorkspace]);

  const streamRef = useRef<MediaStream | null>(null);

  // Cập nhật ref trong effect
  useEffect(() => {
    streamRef.current = localStream;
  }, [localStream]);

  // Dọn dẹp media tracks khi component unmount
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
      // Dừng luồng cũ nếu có
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
      // Dừng chia sẻ màn hình và quay về camera
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

  // Đổi thiết bị Camera
  const handleCameraDeviceChange = (deviceId: string) => {
    setSelectedCameraId(deviceId);
    if (cameraStatus === "active") {
      handleRequestCamera(deviceId, selectedMicId);
    }
  };

  // Đổi thiết bị Micro
  const handleMicDeviceChange = (deviceId: string) => {
    setSelectedMicId(deviceId);
    if (cameraStatus === "active") {
      handleRequestCamera(selectedCameraId, deviceId);
    }
  };

  // Thao tác Ghim sản phẩm
  const handlePinProduct = (product: StudioProductItem) => {
    setPinnedProduct(product);
  };

  // Thao tác Gỡ ghim
  const handleUnpinProduct = () => {
    setPinnedProduct(null);
  };

  // Bắt đầu Livestream (Demo Mode)
  const handleStartLive = () => {
    setIsStarting(true);
    setCurrentStatus("STARTING");
    setTimeout(() => {
      setIsStarting(false);
      setCurrentStatus("LIVE");
    }, 1500);
  };

  // Kết thúc Livestream
  const handleEndLive = () => {
    setCurrentStatus("ENDED");
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
  };

  // 6. Xử lý phiên không tồn tại
  if (!session) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-surface-container-lowest rounded-xl border border-outline-variant/70 text-center shadow-xs">
        <div className="h-12 w-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4 border border-red-100">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-on-surface font-headline-md">
          Không tìm thấy phiên Livestream
        </h2>
        <p className="text-xs sm:text-sm text-on-surface-variant mt-1.5 max-w-md mx-auto">
          Mã phiên <strong className="font-mono text-on-surface">#{livestreamId}</strong> không tồn tại trong danh sách hoặc đã bị xóa.
        </p>
        <div className="mt-6">
          <Link
            href="/shop/livestream"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-container transition shadow-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Quay về danh sách Livestream</span>
          </Link>
        </div>
      </div>
    );
  }

  // 7. Xử lý phiên DRAFT: Cần hoàn thiện thông tin trước khi vào studio
  if (currentStatus === "DRAFT") {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-surface-container-lowest rounded-xl border border-outline-variant/70 text-center shadow-xs">
        <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mx-auto mb-4 border border-slate-200">
          <FileEdit className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs font-semibold mb-3">
          <span>PHIÊN BẢN NHÁP (DRAFT)</span>
        </div>
        <h2 className="text-lg font-bold text-on-surface">
          Phiên chưa sẵn sàng lên sóng
        </h2>
        <p className="text-xs sm:text-sm text-on-surface-variant mt-1.5 max-w-md mx-auto leading-relaxed">
          Phiên <strong>{session.title}</strong> hiện đang là bản nháp và chưa được cấu hình lịch phát sóng hoặc danh mục sản phẩm. Kênh phát Amazon IVS chỉ được cấp phát khi phiên được lên lịch chính thức.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/shop/livestream"
            className="px-4 py-2 bg-white border border-outline-variant text-on-surface text-xs font-semibold rounded-lg hover:bg-surface-container transition"
          >
            Quay về danh sách
          </Link>
          <Link
            href={`/shop/livestream/${session.id}/edit`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-container transition shadow-xs"
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
    <div className="flex flex-col h-[calc(100dvh-132px)] min-h-[540px] lg:h-[calc(100dvh-132px)] lg:min-h-[580px] lg:max-h-[calc(100dvh-132px)] w-full rounded-xl sm:rounded-2xl border border-slate-800 shadow-md bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 1. Top Session Bar */}
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
        chatCount={isLive || isEnded ? session.chatCount || 3420 : "—"}
        aiOrdersCount={isLive || isEnded ? session.aiOrderCount || 284 : "—"}
        className="shrink-0"
      />

      {/* 2. Amazon IVS Stream Telemetry Header */}
      <StudioStreamStatus
        isLive={isLive}
        channelName={session.ivsChannel}
        hasVideoSignal={cameraReady}
      />

      {/* Mobile Tab Switcher (Visible on < 1024px) */}
      <div className="lg:hidden flex items-center bg-[#141C2E] border-b border-slate-800 text-xs shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab("stage")}
          className={`flex-1 py-2.5 text-center font-bold flex items-center justify-center gap-1.5 transition ${
            mobileTab === "stage"
              ? "text-primary border-b-2 border-primary bg-slate-900"
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
              ? "text-primary border-b-2 border-primary bg-slate-900"
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
              ? "text-primary border-b-2 border-primary bg-slate-900"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Sản phẩm ({unpinnedProducts.length})</span>
        </button>
      </div>

      {/* 3. Main Workspace Area */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left / Center: Broadcast Stage & Controls (60% on default desktop, 28% in expanded workspace) */}
        <div
          className={`${
            isExpandedWorkspace
              ? "w-full lg:w-[28%] lg:flex-[28_1_0%] border-r border-slate-800"
              : "w-full lg:w-[60%] lg:flex-[60_1_0%]"
          } flex flex-col min-w-0 bg-slate-950 overflow-hidden transition-all duration-200 ${
            mobileTab !== "stage" ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Header hiển thị chế độ quan sát phụ khi mở rộng không gian bán hàng */}
          {isExpandedWorkspace && (
            <div className="hidden lg:flex items-center justify-between px-3 py-1.5 bg-[#141C2E] border-b border-slate-800 text-[11px] text-slate-300 font-semibold shrink-0">
              <span className="flex items-center gap-1.5 text-indigo-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                VÙNG QUAN SÁT CAMERA
              </span>
              <span className="text-[10px] text-slate-400">16:9 Live Monitor</span>
            </div>
          )}

          {/* Non-scrolling Stage Viewport: Eliminates scrollbar next to video */}
          <div className="flex-1 min-h-0 p-2 sm:p-2.5 overflow-hidden flex flex-col gap-2">
            {/* Pre-live Checklist (Chỉ xuất hiện trước khi phát LIVE và khi chưa mở rộng workspace) */}
            {!isLive && !isEnded && !isExpandedWorkspace && (
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
              />
            </div>
          </div>

          {/* Bottom Device Controls & Broadcast Action Bar */}
          <div className="shrink-0 bg-[#141C2E] border-t border-slate-800 px-3 py-2 sm:px-4 sm:py-2.5 flex flex-wrap items-center justify-between gap-y-2 gap-x-3">
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
        </div>

        {/* Right Sidebar: Sales Control Panel (Điều Hành Bán Hàng) (40% on default desktop, 72% in expanded workspace) */}
        <div
          className={`${
            isExpandedWorkspace
              ? "w-full lg:w-[72%] lg:flex-[72_1_0%]"
              : "w-full lg:w-[40%] lg:flex-[40_1_0%] xl:max-w-[600px] 2xl:max-w-[620px]"
          } shrink-0 bg-surface-container-lowest border-l border-outline-variant flex flex-col overflow-hidden text-on-surface transition-all duration-200 ${
            mobileTab === "stage" ? "hidden lg:flex" : "flex"
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
            activeTab={mobileTab === "stage" ? undefined : mobileTab}
            onTabChange={(tab) => {
              if (mobileTab !== "stage") {
                setMobileTab(tab);
              }
            }}
            isEnded={isEnded}
            isExpandedMode={isExpandedWorkspace}
            onToggleExpandMode={() => setIsExpandedWorkspace((prev) => !prev)}
          />
        </div>
      </div>
    </div>
  );
}
