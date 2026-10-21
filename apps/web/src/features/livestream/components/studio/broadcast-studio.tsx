"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  FileEdit,
  Radio,
  ShoppingBag,
  MessageSquare,
  Layers,
  AlertTriangle,
  ExternalLink,
  X,
} from "lucide-react";
import { mockLivestreams } from "../../mocks/livestream.mock";
import { StudioSessionBar } from "./studio-session-bar";
import { StudioStreamStatus } from "./studio-stream-status";
import { StudioStreamPreview, type CameraStatus } from "./stream-preview";
import { StudioLeftSidebar } from "./studio-left-sidebar";
import { StudioBroadcastActions } from "./studio-broadcast-actions";
import { StudioPreliveChecklist } from "./studio-prelive-checklist";
import { StudioProductsPanel } from "./studio-products-panel";
import { StudioIvsConfigModal } from "./studio-ivs-config-modal";
import { ProductPicker } from "../create/product-picker";
import {
  getLivestreamDetail,
  updateLivestreamStatus,
  mapBackendLivestreamToFrontend,
  getIvsStreamConfig,
  formatFriendlyIvsChannel,
  type IvsStreamConfig,
} from "../../api/get-livestreams";
import type { StudioProductItem } from "../../types/studio";
import type { Livestream, LivestreamStatus, LiveProductItem } from "../../types/livestream";
import { useIvsBroadcast } from "../../hooks/use-ivs-broadcast";
import { useIvsChat } from "../../hooks/use-ivs-chat";
import { mockStudioChatMessages } from "../../mocks/studio.mock";
import {
  getLivestreamProducts,
  getProductUuid,
  addLivestreamProduct,
  updateLivestreamProduct,
  removeLivestreamProduct,
} from "../../api/livestream-products";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


export interface BroadcastStudioProps {
  livestreamId: string;
}

export function BroadcastStudio({ livestreamId }: BroadcastStudioProps) {
  const router = useRouter();
  const isDemoSession = livestreamId === "LIVE-2025-08";

  // 0. Quản lý cảnh báo bảo vệ phiên Live khi rời trang
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [pendingNavigationUrl, setPendingNavigationUrl] = useState<string | null>(null);

  // 1. Quản lý thông tin phiên (từ DB hoặc fallback mock cho phiên demo)
  const [session, setSession] = useState<Livestream | null>(() => {
    return isDemoSession
      ? mockLivestreams.find((item) => item.id === livestreamId) || null
      : null;
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
    isReconnecting,
    reconnectNotice,
  } = useIvsBroadcast();
  const [showWebBroadcastTip, setShowWebBroadcastTip] = useState(true);

  // 2.2.1 AWS IVS Chat Room & WebSocket Real-time Messaging
  const {
    connectionState: chatConnectionState,
    chatMessages: liveChatMessages,
    sendMessage: sendChatMessage,
    isLoadingEarlier,
    hasMoreEarlier,
    loadEarlierMessages,
  } = useIvsChat({
    livestreamId,
    userId: session?.merchantId || "merchant-host",
    username: "Chủ Shop (Host)",
    role: "HOST",
    autoConnect: true,
  });

  const allChatMessages = useMemo(() => {
    // Chỉ chèn tin nhắn demo cho phiên mẫu LIVE-2025-08; phiên thực tế lấy 100% từ AWS IVS Chat
    if (isDemoSession) {
      return [...liveChatMessages, ...mockStudioChatMessages];
    }
    return liveChatMessages;
  }, [isDemoSession, liveChatMessages]);

  // 2.3 Điều khiển Bố cục Studio phong cách TikTok Live Studio (Đóng/Mở Sidebars)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [isTheaterMode, setIsTheaterMode] = useState(false);

  // 2.3.1 Thời lượng phát sóng trực tiếp thời gian thực
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState<number>(0);
  const liveStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (currentStatus !== "LIVE") {
      liveStartTimeRef.current = null;
      return;
    }

    if (!liveStartTimeRef.current) {
      if (session?.startedAt) {
        const startMs = new Date(session.startedAt).getTime();
        liveStartTimeRef.current = isNaN(startMs) ? Date.now() : startMs;
      } else {
        liveStartTimeRef.current = Date.now();
      }
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const diffSec = Math.max(
        0,
        Math.floor((now - (liveStartTimeRef.current || now)) / 1000)
      );
      setLiveElapsedSeconds(diffSec);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentStatus, session?.startedAt]);

  let activeDuration = "00:00:00";
  if (currentStatus === "LIVE") {
    const hours = Math.floor(liveElapsedSeconds / 3600);
    const minutes = Math.floor((liveElapsedSeconds % 3600) / 60);
    const seconds = liveElapsedSeconds % 60;
    activeDuration = [hours, minutes, seconds]
      .map((v) => String(v).padStart(2, "0"))
      .join(":");
  } else if (currentStatus === "ENDED") {
    if (session?.startedAt && session?.endedAt) {
      const diffSec = Math.max(
        0,
        Math.floor(
          (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000
        )
      );
      const hours = Math.floor(diffSec / 3600);
      const minutes = Math.floor((diffSec % 3600) / 60);
      const seconds = diffSec % 60;
      activeDuration = [hours, minutes, seconds]
        .map((v) => String(v).padStart(2, "0"))
        .join(":");
    } else {
      activeDuration = session?.subTimeDisplay?.replace("Thời lượng: ", "") || "00:00:00";
    }
  }

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
    const prods = session?.products || (isDemoSession ? mockLivestreams[0]?.products || [] : []);
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

  // Sản phẩm đang ghim (chỉ ghim khi có sản phẩm được đánh dấu isPinned: true, không tự động ghim)
  const [pinnedProduct, setPinnedProduct] = useState<StudioProductItem | null>(() => {
    const pinned = allProducts.find((p) => p.isPinned);
    return pinned || null;
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

  // Khóa khung nhìn 100vh không cuộn (No-scroll viewport lock) khi vào Studio mà KHÔNG sửa đổi layout chung MerchantShell
  useEffect(() => {
    const main = document.getElementById("main-content");
    const content = main?.parentElement;
    if (!main || !content) return;

    const prevMainStyle = main.getAttribute("style") || "";
    const prevContentStyle = content.getAttribute("style") || "";

    main.style.width = "100%";
    main.style.maxWidth = "none";
    main.style.margin = "0";
    main.style.padding = "0";
    main.style.flex = "1";
    main.style.minHeight = "0";
    main.style.minWidth = "0";
    main.style.display = "flex";
    main.style.flexDirection = "column";
    main.style.overflow = "hidden";

    content.style.height = "100vh";
    content.style.overflow = "hidden";
    content.style.display = "flex";
    content.style.flexDirection = "column";

    return () => {
      if (prevMainStyle) {
        main.setAttribute("style", prevMainStyle);
      } else {
        main.removeAttribute("style");
      }
      if (prevContentStyle) {
        content.setAttribute("style", prevContentStyle);
      } else {
        content.removeAttribute("style");
      }
    };
  }, []);

  const [prevProductsRef, setPrevProductsRef] = useState(session?.products);
  if (session && session.products !== prevProductsRef) {
    setPrevProductsRef(session.products);
    const prods = session.products || (isDemoSession ? mockLivestreams[0]?.products || [] : []);
    const mapped = prods.map((p, index) => ({
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
    setAllProducts(mapped);
    const pinned = mapped.find((p) => p.isPinned);
    setPinnedProduct(pinned || null);
  }

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
  const [liveErrorMessage, setLiveErrorMessage] = useState<string | null>(null);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);

  // Thêm sản phẩm trực tiếp từ kho vào phiên ngay tại Studio
  const handleAddProductsFromPicker = async (selectedCatalogItems: LiveProductItem[]) => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isRealLive = UUID_REGEX.test(livestreamId);

    const newStudioItems: StudioProductItem[] = [];

    for (const item of selectedCatalogItems) {
      if (isRealLive) {
        try {
          await addLivestreamProduct(livestreamId, {
            productId: item.id,
            isFeatured: false,
            displayOrder: allProducts.length + newStudioItems.length + 1,
          });
        } catch (err) {
          console.warn("[Studio] Error adding product to livestream:", err);
        }
      }
      newStudioItems.push({
        id: item.id,
        name: item.name,
        sku: item.sku,
        price: item.price,
        originalPrice: item.originalPrice,
        stock: item.stock,
        image: item.image,
        isPinned: false,
        orderCode: item.id,
        salesCount: 0,
      });
    }

    setAllProducts((prev) => {
      const merged = [...prev];
      for (const item of newStudioItems) {
        if (!merged.some((p) => p.id === item.id)) {
          merged.push(item);
        }
      }
      return merged;
    });

    // Không tự động ghim sản phẩm: chỉ ghim khi người bán bấm nút Ghim
    setIsProductPickerOpen(false);
  };

  // Bỏ sản phẩm ra khỏi phiên live
  const handleRemoveProduct = async (product: StudioProductItem) => {
    // Nếu sản phẩm đang được ghim, hủy ghim
    if (pinnedProduct?.id === product.id) {
      setPinnedProduct(null);
    }
    // Xóa khỏi danh sách sản phẩm hiển thị trong studio
    setAllProducts((prev) => prev.filter((p) => p.id !== product.id));

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_REGEX.test(livestreamId)) {
      try {
        await removeLivestreamProduct(livestreamId, product.id);
      } catch (err) {
        console.warn("[Studio] Error removing product from livestream:", err);
      }
    }
  };

  // Bắt đầu Livestream
  const handleStartLive = async () => {
    setIsStarting(true);
    setLiveErrorMessage(null);
    const prevStatus = currentStatus;
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
        await startBroadcast({
          ingestEndpoint: conf.ingestEndpoint,
          streamKey: conf.streamKey,
          localStream: stream,
        });
      } else if (!stream) {
        throw new Error("Không có tín hiệu Camera/Micro. Vui lòng bật Camera trước khi phát trực tiếp.");
      } else if (!conf?.ingestEndpoint || !conf?.streamKey) {
        throw new Error("Không thể lấy cấu hình Ingest Endpoint hoặc Stream Key từ AWS IVS.");
      }

      setCurrentStatus("LIVE");
      setLiveToastMessage(
        conf?.channelArn
          ? `Đã phát sóng trực tiếp thành công lên AWS IVS!`
          : "Đã bắt đầu phát sóng phòng TikTok Live Studio!"
      );
      setTimeout(() => setLiveToastMessage(null), 6000);
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : "Không thể bắt đầu phát sóng. Vui lòng kiểm tra lại dịch vụ.";
      console.warn("[Studio] Failed to update status on server:", errMsg);
      setCurrentStatus(prevStatus);
      setLiveErrorMessage(errMsg);
    } finally {
      setIsStarting(false);
    }
  };

  // Tiếp tục phát sóng lại (Resume Live sau khi F5 hoặc gián đoạn kết nối)
  const handleResumeBroadcast = async () => {
    setIsStarting(true);
    setLiveErrorMessage(null);
    try {
      let conf = ivsConfig;
      if (!conf) {
        conf = await getIvsStreamConfig(livestreamId);
        setIvsConfig(conf);
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
          console.warn("[Studio] Could not acquire camera on resume broadcast:", mediaErr);
        }
      }

      if (stream && conf?.ingestEndpoint && conf?.streamKey) {
        await startBroadcast({
          ingestEndpoint: conf.ingestEndpoint,
          streamKey: conf.streamKey,
          localStream: stream,
        });
        setLiveToastMessage("Đã tiếp tục phát sóng thành công lên AWS IVS!");
        setTimeout(() => setLiveToastMessage(null), 5000);
      } else if (!stream) {
        throw new Error("Không có tín hiệu Camera/Micro. Vui lòng cho phép quyền Camera để tiếp tục.");
      } else if (!conf?.ingestEndpoint || !conf?.streamKey) {
        throw new Error("Không thể lấy cấu hình Ingest Endpoint hoặc Stream Key từ AWS IVS.");
      }
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Không thể tiếp tục phát sóng. Vui lòng thử lại.";
      setLiveErrorMessage(errMsg);
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

  // 2.5 Bảo vệ phiên live: Cảnh báo khi người dùng reload / đóng tab / đổi URL
  useEffect(() => {
    if (currentStatus !== "LIVE") return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Phiên livestream đang phát trực tiếp. Rời khỏi trang sẽ ngắt kết nối video lên AWS.";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [currentStatus]);

  // 2.6 Bảo vệ phiên live: Bắt các liên kết điều hướng nội bộ trong web app khi đang LIVE
  useEffect(() => {
    if (currentStatus !== "LIVE") return;

    const handleClickLink = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target) return;

      // Nếu link mở tab mới (target="_blank"), cho phép hoạt động tự nhiên
      if (target.target === "_blank") return;

      const href = target.getAttribute("href");
      // Nếu link dẫn đi trang khác ngoài Studio
      if (href && !href.startsWith("#") && !href.includes(`/studio`)) {
        e.preventDefault();
        e.stopPropagation();
        setPendingNavigationUrl(href);
        setIsLeaveConfirmOpen(true);
      }
    };

    document.addEventListener("click", handleClickLink, true);
    return () => document.removeEventListener("click", handleClickLink, true);
  }, [currentStatus]);

  const handleOpenPendingInNewTab = () => {
    if (pendingNavigationUrl) {
      window.open(pendingNavigationUrl, "_blank", "noopener,noreferrer");
    }
    setIsLeaveConfirmOpen(false);
    setPendingNavigationUrl(null);
  };

  const handleCancelLeave = () => {
    setIsLeaveConfirmOpen(false);
    setPendingNavigationUrl(null);
  };

  const handleConfirmLeaveAndStopLive = async () => {
    const dest = pendingNavigationUrl;
    setIsLeaveConfirmOpen(false);
    setPendingNavigationUrl(null);
    await handleEndLive();
    if (dest) {
      router.push(dest);
    }
  };

  if (isLoadingSession) {
    return (
      <div className="flex-1 w-full h-full flex flex-col items-center justify-center p-8 bg-[#0B1220] text-center gap-3">
        <div className="w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-300">Đang tải phòng TikTok Live Studio...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex-1 w-full h-full flex flex-col items-center justify-center p-6 bg-[#0B1220] text-slate-100">
        <div className="max-w-md w-full bg-slate-900 rounded-xl border border-slate-800 text-center shadow-lg p-8">
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
      </div>
    );
  }

  if (currentStatus === "DRAFT") {
    return (
      <div className="flex-1 w-full h-full flex flex-col items-center justify-center p-6 bg-[#0B1220] text-slate-100">
        <div className="max-w-md w-full bg-slate-900 rounded-xl border border-slate-800 text-center shadow-lg p-8">
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
    <div
      id="broadcast-studio-root"
      className="relative flex flex-col h-full w-full flex-1 min-h-0 bg-[#0B1220] text-slate-100 overflow-hidden font-sans"
    >
      <style>{`
        body:has(#broadcast-studio-root) {
          overflow: hidden !important;
        }
        body:has(#broadcast-studio-root) #main-content {
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          flex: 1 1 0% !important;
          min-height: 0 !important;
          min-width: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
        }
        body:has(#broadcast-studio-root) div[class*="content"] {
          height: 100vh !important;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
        }
      `}</style>
      {/* Toast Notification khi Bắt đầu phát sóng */}
      {liveToastMessage && (
        <div className="absolute top-3 right-3 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-[#1E293B] border border-emerald-500/40 text-emerald-300 rounded-xl shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
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

      {/* Toast Notification khi Tự động khôi phục luồng phát do chuyển tab */}
      {reconnectNotice && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2 bg-[#1E293B] border border-cyan-500/60 text-cyan-200 rounded-xl shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span>{reconnectNotice}</span>
        </div>
      )}

      {/* Error Toast Notification khi Bắt đầu phát sóng thất bại (ví dụ: đang có phiên khác live) */}
      {liveErrorMessage && (
        <div className="absolute top-3 right-3 z-50 flex items-start gap-2.5 px-4 py-3 bg-[#1E293B] border border-red-500/60 text-red-200 rounded-xl shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-200 max-w-md">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 mt-0.5 animate-pulse" />
          <span className="flex-1 leading-relaxed">{liveErrorMessage}</span>
          <button
            type="button"
            onClick={() => setLiveErrorMessage(null)}
            className="ml-2 hover:opacity-80 font-bold text-red-400 p-0.5"
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
        duration={activeDuration}
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
      <div className="flex items-center justify-between bg-[#0B1220] border-b border-slate-800 pr-3">
        <div className="flex-1 min-w-0">
          <StudioStreamStatus
            isLive={isLive}
            channelName={
              ivsConfig?.channelArn
                ? formatFriendlyIvsChannel(ivsConfig.channelArn)
                : formatFriendlyIvsChannel(session.ivsChannel)
            }
            hasVideoSignal={cameraReady}
            broadcastState={broadcastState}
            isReconnecting={isReconnecting}
          />
        </div>
        <button
          onClick={handleOpenIvsModal}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md bg-[#151F31] text-slate-200 border border-slate-700/80 hover:bg-slate-800 hover:text-white transition-all shrink-0 active:scale-95 shadow-xs cursor-pointer"
        >
          <Radio className="w-3.5 h-3.5 text-cyan-400" />
          <span>Cấu hình OBS / IVS</span>
        </button>
      </div>

      {/* 2.1 Mẹo phát sóng Web Broadcast vs OBS */}
      {showWebBroadcastTip && isLive && broadcastState === "LIVE" && (
        <div className="flex items-center justify-between gap-3 px-3.5 py-1.5 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border-b border-amber-500/20 text-xs text-amber-200/90 shrink-0 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wide shrink-0">
              💡 Mẹo phát sóng
            </span>
            <span className="truncate text-[11px] text-slate-300">
              Bạn đang phát qua webcam trình duyệt. Hãy <strong>kéo tab này ra một cửa sổ riêng</strong> (hoặc dùng <strong>OBS Studio</strong>) để tránh trình duyệt tạm dừng video khi mở tab khác.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleOpenIvsModal}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-medium cursor-pointer"
            >
              Cấu hình OBS
            </button>
            <button
              type="button"
              onClick={() => setShowWebBroadcastTip(false)}
              className="text-slate-400 hover:text-slate-200 text-xs font-bold px-1 cursor-pointer"
              title="Đóng thông báo"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Mobile Tab Switcher (Visible on < 1024px) */}
      <div className="lg:hidden flex items-center bg-[#0B1220] border-b border-slate-800 text-xs shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab("stage")}
          className={`flex-1 py-2.5 text-center font-bold flex items-center justify-center gap-1.5 transition ${mobileTab === "stage"
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
          className={`flex-1 py-2.5 text-center font-bold flex items-center justify-center gap-1.5 transition ${mobileTab === "chat"
              ? "text-cyan-400 border-b-2 border-cyan-400 bg-slate-900/90"
              : "text-slate-400 hover:text-slate-200"
            }`}
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Tin nhắn</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("products")}
          className={`flex-1 py-2.5 text-center font-bold flex items-center justify-center gap-1.5 transition ${mobileTab === "products"
              ? "text-cyan-400 border-b-2 border-cyan-400 bg-slate-900/90"
              : "text-slate-400 hover:text-slate-200"
            }`}
        >
          <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Sản phẩm ({unpinnedProducts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("tools")}
          className={`flex-1 py-2.5 text-center font-bold flex items-center justify-center gap-1.5 transition ${mobileTab === "tools"
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
          className={`${isLeftSidebarOpen ? "w-64 xl:w-72 2xl:w-80" : "w-0 overflow-hidden border-none"
            } transition-all duration-300 ease-in-out shrink-0 ${mobileTab === "tools" ? "flex w-full" : "hidden lg:flex"
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
          className={`flex-1 min-w-0 flex flex-col bg-[#080B10] overflow-hidden transition-all duration-300 ease-in-out ${mobileTab !== "stage" ? "hidden lg:flex" : "flex"
            }`}
          aria-label="Khu vực màn hình Livestream chính"
        >
          {/* Non-scrolling Stage Viewport */}
          <div className="flex-1 min-h-0 p-1.5 sm:p-2.5 overflow-hidden flex flex-col gap-2">
            {/* Grace Period Reconnection Banner (Khi phiên đang LIVE nhưng video chưa đẩy lên AWS, vd sau khi F5) */}
            {isLive && broadcastState !== "LIVE" && (
              <div className="shrink-0 flex items-center justify-between gap-3 p-3 bg-amber-950/70 border border-amber-500/40 rounded-xl text-amber-200 text-xs shadow-lg animate-in fade-in duration-200">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                  </span>
                  <div className="min-w-0">
                    <span className="font-bold text-white block">
                      Luồng phát đang tạm dừng kết nối (Grace Period)
                    </span>
                    <span className="text-[11px] text-amber-300/80 truncate block">
                      Bạn vừa tải lại trang hoặc ngắt kết nối. Kênh AWS IVS đang chờ nhận lại luồng video.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isStarting}
                  onClick={handleResumeBroadcast}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-lg shadow-md transition active:scale-95 cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <Radio className={`w-3.5 h-3.5 ${isStarting ? "animate-spin" : ""}`} />
                  <span>{isStarting ? "Đang kết nối lại..." : "TIẾP TỤC PHÁT SÓNG"}</span>
                </button>
              </div>
            )}

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
                  onOpenProductPicker={() => setIsProductPickerOpen(true)}
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
                broadcastState={broadcastState}
                onResumeLive={handleResumeBroadcast}
                isResuming={isStarting}
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
          <div className="shrink-0 bg-[#0B1220] border-t border-slate-800 px-3 py-2 sm:px-4 flex items-center justify-between gap-3">
            <StudioBroadcastActions
              isLive={isLive}
              isStarting={isStarting}
              isEnded={isEnded}
              canStartLive={canStartLive}
              cameraEnabled={cameraEnabled && cameraStatus === "active"}
              micEnabled={micEnabled && Boolean(localStream)}
              isScreenSharing={isScreenSharing}
              broadcastState={broadcastState}
              onResumeLive={handleResumeBroadcast}
              isResuming={isStarting}
              onToggleMic={handleToggleMic}
              onToggleCamera={handleToggleCamera}
              onToggleScreenShare={handleToggleScreenShare}
              onStartLive={handleStartLive}
              onEndLive={handleEndLive}
              className="w-full"
            />
          </div>
        </main>

        {/* ========================================================
            3.3 RIGHT SIDEBAR: Bán hàng & Tương tác (Sales & Chat Ops)
            Tự động gập mở mượt mà khi bấm nút
            ======================================================== */}
        <div
          className={`${isRightSidebarOpen
              ? "w-full lg:w-[380px] xl:w-[420px] 2xl:w-[460px]"
              : "w-0 overflow-hidden border-none"
            } transition-all duration-300 ease-in-out shrink-0 ${mobileTab === "stage" || mobileTab === "tools" ? "hidden lg:flex" : "flex"
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
            chatMessages={allChatMessages}
            connectionState={chatConnectionState}
            onSendMessage={sendChatMessage}
            isLoadingEarlier={isLoadingEarlier}
            hasMoreEarlier={hasMoreEarlier}
            onLoadEarlier={loadEarlierMessages}
            isEnded={isEnded}
            isExpandedMode={false}
            onCloseSidebar={() => setIsRightSidebarOpen(false)}
            onOpenAddProduct={() => setIsProductPickerOpen(true)}
            onRemoveProduct={handleRemoveProduct}
            className="w-full h-full"
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

      {/* Modal Thêm sản phẩm trực tiếp từ kho vào phiên ngay tại Studio */}
      <ProductPicker
        isOpen={isProductPickerOpen}
        onClose={() => setIsProductPickerOpen(false)}
        selectedProducts={allProducts.map((p) => ({
          id: p.id,
          code: p.orderCode || p.id,
          sku: p.sku,
          name: p.name,
          price: p.price,
          originalPrice: p.originalPrice,
          stock: p.stock,
          image: p.image,
          category: "",
        }))}
        onAddProducts={handleAddProductsFromPicker}
      />

      {/* Modal Cảnh báo khi đang LIVE mà bấm chuyển trang */}
      {isLeaveConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-[#151F31] rounded-2xl border border-amber-500/40 shadow-2xl overflow-hidden flex flex-col text-slate-100 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0B1220]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">
                    Phiên phát sóng đang trực tiếp!
                  </h3>
                  <p className="text-[11px] text-amber-300/80 font-medium">
                    Cảnh báo ngắt luồng AWS IVS
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelLeave}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                aria-label="Đóng cảnh báo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-3 text-xs leading-relaxed text-slate-300">
              <p>
                Bạn đang phát sóng trực tiếp từ webcam trình duyệt. Nếu bạn rời khỏi màn hình Studio này để chuyển sang <strong className="text-white font-mono">{pendingNavigationUrl}</strong>, trình duyệt sẽ <strong>tắt camera và ngắt kết nối luồng phát trên AWS ngay lập tức</strong>.
              </p>
              <div className="p-3 bg-cyan-950/40 border border-cyan-500/30 rounded-xl text-cyan-200 text-[11px] leading-relaxed">
                💡 <strong>Khuyên dùng:</strong> Hãy chọn <strong>&quot;Mở trong Tab mới&quot;</strong> để vừa giữ phiên live hoạt động trên AWS, vừa thoải mái xem danh sách tổng quan hoặc quản lý đơn hàng.
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 py-3.5 border-t border-slate-800 bg-[#0B1220] flex flex-col sm:flex-row gap-2 justify-end">
              <button
                type="button"
                onClick={handleCancelLeave}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer order-2 sm:order-1"
              >
                Ở lại phòng Live
              </button>
              <button
                type="button"
                onClick={handleOpenPendingInNewTab}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition cursor-pointer order-1 sm:order-2"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở trong Tab mới (Khuyên dùng)</span>
              </button>
              <button
                type="button"
                onClick={handleConfirmLeaveAndStopLive}
                className="px-3 py-2 bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-semibold rounded-lg border border-rose-800/80 transition cursor-pointer order-3"
              >
                Rời đi &amp; Dừng live
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
