"use client";

import Link from "next/link";
import { ApiError, cartApi, customerIdentityApi, layTokenKhach, type CartOrder } from "@/lib/api";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, Radio, Send, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toast, type ToastMessage } from "@/components/feedback/toast";
import { formatMoney } from "@/lib/format";
import { useDaGan } from "@/lib/use-da-gan";
import { CartDrawer, monVuaThem, useGioHang } from "@/features/orders/cart-drawer";
import gioStyles from "@/features/orders/cart-drawer.module.css";
import { COMMERCE_API_BASE_URL } from "./api/create-livestream";
import { getLivestreamDetail, isValidUuid, type BackendLivestreamDetailResponse } from "./api/get-livestreams";
import { getCommentConfirmation, postLivestreamCommentWithReceipt } from "./api/livestream-comments";
import { useIvsChat } from "./hooks/use-ivs-chat";
import type { StudioChatMessage } from "./types/studio";
import styles from "./customer-live.module.css";

type LiveSession = { id: string; title: string };

/** Câu trả lời cho khách khi AI đã đọc xong mà không ra đơn. */
const LY_DO_KHONG_RA_DON: Record<string, string> = {
  OUT_OF_STOCK: "Sản phẩm bạn chốt đã hết hàng. Hãy chọn mã khác trong phiên.",
  SKU_NOT_FOUND: "Không nhận ra mã sản phẩm trong phiên này. Gõ đúng mã như shop đọc (ví dụ A12).",
  NO_PURCHASE_INTENT: "AI thấy đây không phải bình luận chốt đơn. Muốn mua thì gõ mã + số lượng.",
  NEEDS_CLARIFICATION: "AI chưa rõ bạn muốn mua mã nào, bao nhiêu. Gõ lại rõ hơn, ví dụ: Chốt A12 size M 2 cái.",
  LIVESTREAM_CLOSED: "Phiên live đã kết thúc, không nhận đơn nữa.",
  LOW_CONFIDENCE: "AI chưa chắc đây là ý định mua. Gõ lại rõ mã và số lượng.",
};
type PendingComment = { id: string; receipt: string; createdAt: number };

function pendingStorageKey(livestreamId: string, customerId: string): string {
  return `liveorder_pending_comment:${customerId}:${livestreamId}`;
}

function LiveVideo({ url }: { url: string | null }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element || !url) return;
    if (element.canPlayType("application/vnd.apple.mpegurl")) {
      element.src = url;
      return;
    }
    type Player = { loadSource: (url: string) => void; attachMedia: (video: HTMLVideoElement) => void; destroy: () => void };
    type Hls = { new (): Player; isSupported: () => boolean };
    let player: Player | null = null;
    let active = true;
    const attach = () => {
      const Hls = (window as Window & { Hls?: Hls }).Hls;
      if (!active || !Hls?.isSupported()) return;
      player = new Hls();
      player.loadSource(url);
      player.attachMedia(element);
    };
    if ((window as Window & { Hls?: Hls }).Hls) attach();
    else {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
      script.async = true;
      script.addEventListener("load", attach, { once: true });
      document.head.appendChild(script);
    }
    return () => { active = false; player?.destroy(); element.removeAttribute("src"); element.load(); };
  }, [url]);
  return url
    ? <video ref={video} className={styles.liveVideo} controls autoPlay muted playsInline aria-label="Video livestream" />
    : <p>Phiên này chưa có đường phát video IVS.</p>;
}

export function CustomerLiveConnected() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [session, setSession] = useState<BackendLivestreamDetailResponse | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [username, setUsername] = useState("Khách xem live");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PendingComment | null>(null);
  const [autoCheck, setAutoCheck] = useState(true);
  const [confirmPath, setConfirmPath] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [localComments, setLocalComments] = useState<StudioChatMessage[]>([]);
  const { chatMessages } = useIvsChat({
    livestreamId: session?.id ?? "", userId: customerId, username,
    role: "VIEWER", autoConnect: Boolean(session && customerId),
  });

  // Giỏ hàng = đơn nháp đang mở trong phiên; chỉ có khi đã đăng nhập.
  const daDangNhap = useDaGan() && Boolean(layTokenKhach());
  const gio = useGioHang(session?.id ?? null, daDangNhap);
  const [moGio, setMoGio] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  // Ảnh giỏ và hàm tải lại để checkConfirmation đọc mà không phải đưa
  // `gio` vào deps — đưa vào là interval poll bị dựng lại mỗi render.
  const gioRef = useRef<{ gio: CartOrder | null; taiLai: () => void }>({ gio: null, taiLai: () => undefined });
  useEffect(() => {
    gioRef.current = { gio: gio.gio, taiLai: gio.taiLai };
  }, [gio.gio, gio.taiLai]);

  useEffect(() => {
    let user: { id?: number; full_name?: string } | null = null;
    try {
      user = JSON.parse(localStorage.getItem("auth_user") ?? "null") as { id?: number; full_name?: string } | null;
    } catch { /* Use an anonymous browser identity. */ }
    const key = `liveorder_customer_uuid:${user?.id ?? "guest"}`;
    const saved = localStorage.getItem(key);
    const id = saved && isValidUuid(saved) ? saved : crypto.randomUUID();
    localStorage.setItem(key, id);
    setCustomerId(id);
    if (user?.full_name) setUsername(user.full_name);

    // Đã đăng nhập thì báo máy chủ mã khách này là của tài khoản này,
    // để link xác nhận đơn chỉ mở được bằng đúng tài khoản. 409 nghĩa
    // là mã đang thuộc tài khoản khác trên cùng máy: sinh mã mới cho
    // tài khoản này thay vì dùng chung — dùng chung là người sau không
    // bao giờ mở được đơn của mình.
    if (!layTokenKhach()) return;
    void customerIdentityApi.link(id).catch(async (err: unknown) => {
      if (!(err instanceof ApiError && err.status === 409)) return;
      const moi = crypto.randomUUID();
      localStorage.setItem(key, moi);
      setCustomerId(moi);
      await customerIdentityApi.link(moi).catch(() => undefined);
    });
  }, []);

  useEffect(() => {
    if (!session || !customerId) return;
    const key = pendingStorageKey(session.id, customerId);
    const saved = localStorage.getItem(key);
    if (!saved) return;
    try {
      const value: unknown = JSON.parse(saved);
      if (typeof value === "object" && value !== null &&
        "id" in value && typeof value.id === "string" &&
        "receipt" in value && typeof value.receipt === "string") {
        setPending({
          id: value.id,
          receipt: value.receipt,
          createdAt: "createdAt" in value && typeof value.createdAt === "number"
            ? value.createdAt
            : Date.now(),
        });
        setAutoCheck(true);
      }
    } catch { localStorage.removeItem(key); }
  }, [session?.id, customerId]);

  useEffect(() => {
    let active = true;
    fetch(`${COMMERCE_API_BASE_URL}/api/livestreams/public/live`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ items: LiveSession[] }>;
      })
      .then((data) => {
        if (!active) return;
        setSessions(data.items);
        const requested = new URLSearchParams(window.location.search).get("livestreamId");
        const chosen = data.items.find((item) => item.id === requested) ?? data.items[0];
        if (chosen) void getLivestreamDetail(chosen.id).then(setSession).catch(() => setNotice("Không tải được phiên live."));
      })
      .catch(() => { if (active) setNotice("Không tải được danh sách livestream. Kiểm tra Commerce Service."); });
    return () => { active = false; };
  }, []);

  const checkConfirmation = useCallback(async () => {
    if (!pending) return;
    try {
      const result = await getCommentConfirmation(pending.id, pending.receipt);
      if (result.status === "ready" && result.confirmPath) {
        setPending(null);
        if (session) localStorage.removeItem(pendingStorageKey(session.id, customerId));
        if (daDangNhap && session) {
          // Đã đăng nhập: món vào giỏ. So giỏ trước/sau để toast nói
          // đúng tên món thay vì một câu chung chung.
          const truoc = gioRef.current.gio;
          const sau = await cartApi.get(session.id).catch(() => null);
          gioRef.current.taiLai();
          const them = monVuaThem(truoc, sau);
          setToast({
            id: Date.now(),
            text: them.length > 0 ? `Đã thêm ${them.join(", ")} vào giỏ hàng` : "Đã thêm vào giỏ hàng",
            action: { label: "Xem giỏ", onClick: () => setMoGio(true) },
          });
          setNotice("Đã bỏ vào giỏ hàng. Mở giỏ để xác nhận mua.");
        } else {
          setConfirmPath(result.confirmPath);
          setNotice(`AI đã tạo đơn ${result.orderCode ?? ""}. Mở form để xác nhận địa chỉ.`);
        }
      } else if (result.status === "needs_review") {
        setNotice("Ý định mua đã được nhận diện; đơn đang chờ shop duyệt.");
      } else if (result.status === "unavailable") {
        setPending(null);
        if (session) localStorage.removeItem(pendingStorageKey(session.id, customerId));
        setNotice(LY_DO_KHONG_RA_DON[result.reason ?? ""] ?? "Bình luận này không tạo được đơn. Kiểm tra lại mã hàng và tồn kho.");
      } else if (Date.now() - pending.createdAt > 60_000) {
        setAutoCheck(false);
        setNotice("Chưa có đơn từ bình luận này. AI có thể chưa xử lý hoặc chưa xác định ý định mua; bạn có thể kiểm tra lại.");
      }
    } catch { setNotice("Chưa kiểm tra được kết quả AI. Vui lòng thử lại."); }
  }, [pending, session, customerId, daDangNhap]);

  useEffect(() => {
    if (!pending || !autoCheck) return;
    void checkConfirmation();
    const timer = window.setInterval(() => { void checkConfirmation(); }, 3000);
    return () => window.clearInterval(timer);
  }, [pending, autoCheck, checkConfirmation]);

  async function handleComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !customerId || !message.trim() || sending) return;
    setSending(true);
    const result = await postLivestreamCommentWithReceipt(session.id, {
      userId: customerId, username, content: message.trim(), role: "buyer",
    });
    setSending(false);
    if (!result?.confirmationReceipt) {
      setNotice("Gửi bình luận thất bại. Kiểm tra phiên live và thử lại.");
      return;
    }
    setMessage("");
    setLocalComments((current) => [...current, result.comment]);
    setConfirmPath(null);
    const createdAt = Date.now();
    setPending({ id: result.comment.id, receipt: result.confirmationReceipt, createdAt });
    setAutoCheck(true);
    localStorage.setItem(pendingStorageKey(session.id, customerId), JSON.stringify({
      id: result.comment.id,
      receipt: result.confirmationReceipt,
      createdAt,
    }));
    setNotice("Đã gửi bình luận. AI đang kiểm tra ý định đặt hàng.");
  }

  return <div className={styles.page}>
    <div className={styles.demoNote}><Radio size={16} /> Phiên live · Bình luận được gửi tới Commerce và AI</div>
    {sessions.length > 1 && <label className={styles.sessionPicker}>Chọn phiên đang live
      <select value={session?.id ?? ""} onChange={(event) => {
        setPending(null); setConfirmPath(null); setLocalComments([]);
        void getLivestreamDetail(event.target.value).then(setSession).catch(() => setNotice("Không tải được phiên live."));
      }}>{sessions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
    </label>}
    <div className={styles.liveGrid}>
      <section className={styles.streamColumn} aria-label="Livestream và sản phẩm">
        <div className={styles.videoCard}>{session ? <LiveVideo url={session.playbackUrl} /> : <p>Chưa có phiên livestream nào đang phát.</p>}</div>
        <div className={styles.streamIntro}><div><p className={styles.eyebrow}>LIVEORDER AI</p>
          <h1>{session?.title ?? "Livestream"}</h1><p>Bình luận mã sản phẩm để AI nhận diện ý định mua và tạo đơn khi mã hợp lệ.</p></div></div>
        <div className={styles.productsHeader}><h2>Sản phẩm trong phiên</h2><span>{session?.products.length ?? 0} sản phẩm</span></div>
        <div className={styles.productGrid}>{session?.products.map((item) => <article className={styles.productCard} key={item.id}>
          <div className={styles.productInfo}><p className={styles.productName}>{item.productName ?? item.productCode ?? "Sản phẩm"}</p>
            <p className={styles.productStock}>Mã: {item.skuCode ?? item.productCode ?? "Chưa có mã"}</p>
            <strong>{formatMoney(item.price ?? 0)}</strong></div></article>)}</div>
      </section>
      <aside className={styles.chatPanel} aria-label="Bình luận trong phiên livestream">
        <div className={styles.chatHeader}><MessageCircle size={19} /><div><h2>Trò chuyện</h2><p>IVS Chat</p></div>
          {daDangNhap ? (
            <button type="button" className={gioStyles.nutGio} onClick={() => setMoGio(true)} aria-label={`Giỏ hàng, ${gio.soMon} sản phẩm`}>
              <ShoppingCart size={16} aria-hidden="true" /> Giỏ hàng
              {gio.soMon > 0 && <span className={gioStyles.huyHieu} data-testid="so-mon-gio">{gio.soMon}</span>}
            </button>
          ) : (
            <Link href="/login" className={gioStyles.nutGio} title="Đăng nhập để dùng giỏ hàng">
              <ShoppingCart size={16} aria-hidden="true" /> Giỏ hàng
            </Link>
          )}
        </div>
        <div className={styles.chatTip}>Ví dụ: <strong>Chốt A12 màu đen size M 2 cái</strong></div>
        <div className={styles.commentList}>{[
          ...chatMessages,
          ...localComments.filter((item) => !chatMessages.some((message) => message.id === item.id)),
        ].slice(-50).map((item) => <div className={styles.comment} key={item.id}>
          <div className={styles.commentBody}><strong>{item.userName}</strong><p>{item.content}</p></div></div>)}</div>
        <form className={styles.chatForm} onSubmit={handleComment}>
          <Input label="Bình luận của bạn" placeholder="Hỏi shop hoặc chốt đơn..." value={message} maxLength={500}
            onChange={(event) => setMessage(event.target.value)} />
          <Button type="submit" disabled={!session || !customerId || !message.trim() || sending}><Send size={16} /> {sending ? "Đang gửi..." : "Gửi bình luận"}</Button>
          <p className={styles.notice} role="status">{notice}</p>
          {pending && <button type="button" onClick={() => void checkConfirmation()}>Kiểm tra kết quả AI</button>}
          {confirmPath && !daDangNhap && <Link href={confirmPath} className={styles.confirmLink}>Mở form xác nhận đơn hàng →</Link>}
        </form>
      </aside>
    </div>
    <CartDrawer open={moGio} onClose={() => setMoGio(false)} gio={gio.gio} dangTai={gio.dangTai} taiLai={gio.taiLai} />
    <Toast message={toast} onClose={() => setToast(null)} />
  </div>;
}
