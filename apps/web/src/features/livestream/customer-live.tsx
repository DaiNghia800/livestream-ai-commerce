"use client";

import { useState, type FormEvent } from "react";
import {
  Eye,
  Heart,
  MessageCircle,
  Play,
  Radio,
  Send,
  Shirt,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { products, comments } from "@/mocks/commerce";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import styles from "./customer-live.module.css";

export function CustomerLive() {
  const [selected, setSelected] = useState<(typeof products)[number] | null>(null);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");

  function handleComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("Đây là bản mẫu. Bình luận chưa được gửi lên hệ thống.");
    setMessage("");
  }

  return (
    <div className={styles.page}>
      <div className={styles.demoNote}>
        <Sparkles size={16} aria-hidden="true" />
        <span>Trải nghiệm bản mẫu · Video, bình luận và sản phẩm là dữ liệu minh họa</span>
      </div>

      <div className={styles.liveGrid}>
        <section className={styles.streamColumn} aria-labelledby="stream-title">
          <div className={styles.videoCard}>
            <div className={styles.videoGlow} aria-hidden="true" />
            <div className={styles.videoTop}>
              <span className={styles.livePill}><span /> PHIÊN MẪU</span>
              <span className={styles.viewerPill}><Eye size={15} /> 1.284 đang xem</span>
            </div>

            <div className={styles.videoCenter}>
              <div className={styles.playMark}><Play size={27} fill="currentColor" /></div>
              <p className={styles.videoEyebrow}>CHICSTYLE OFFICIAL</p>
              <p>Không gian phát livestream sẽ được kết nối ở giai đoạn tích hợp.</p>
            </div>

            <div className={styles.videoBottom}>
              <span><Radio size={16} /> Bộ sưu tập Linen mùa hè</span>
              <span>00:42:18</span>
            </div>
          </div>

          <div className={styles.streamIntro}>
            <div>
              <p className={styles.eyebrow}>CHICSTYLE OFFICIAL <span>✦</span></p>
              <h1 id="stream-title">Đại tiệc Flash Sale BST Linen</h1>
              <p>Chọn món bạn yêu thích và trò chuyện cùng cửa hàng ngay trong phiên live.</p>
            </div>
            <button className={styles.followButton} type="button" aria-label="Theo dõi cửa hàng">
              <Heart size={17} /> Theo dõi
            </button>
          </div>

          <div className={styles.productsHeader}>
            <div>
              <p className={styles.eyebrow}>CHỌN MÓN YÊU THÍCH</p>
              <h2>Sản phẩm trong phiên</h2>
            </div>
            <span className={styles.itemCount}><ShoppingBag size={15} /> {products.length} sản phẩm</span>
          </div>

          <div className={styles.productGrid}>
            {products.map((product, index) => (
              <article className={styles.productCard} key={product.id}>
                <div className={`${styles.productArt} ${styles[product.color] ?? ""}`}>
                  <span className={styles.productTag}>{index === 0 ? "BÁN CHẠY" : "BST LINEN"}</span>
                  <Shirt size={58} strokeWidth={1.15} aria-hidden="true" />
                  <span className={styles.productCode}>{product.id}</span>
                </div>
                <div className={styles.productInfo}>
                  <p className={styles.productName}>{product.name}</p>
                  <p className={styles.productStock}>Còn {product.stock} sản phẩm <span>·</span> Minh họa</p>
                  <div className={styles.productBuyRow}>
                    <strong>{formatMoney(product.price)}</strong>
                    <button type="button" onClick={() => setSelected(product)} aria-label={`Xem ${product.name}`}>
                      Xem <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className={styles.chatPanel} aria-label="Bình luận trong phiên livestream">
          <div className={styles.chatHeader}>
            <div className={styles.chatIcon}><MessageCircle size={19} /></div>
            <div>
              <h2>Trò chuyện</h2>
              <p>Cùng nhau chia sẻ khoảnh khắc</p>
            </div>
            <span className={styles.chatLive}><span /> LIVE</span>
          </div>

          <div className={styles.chatTip}>
            <Sparkles size={16} />
            <p>Muốn chốt món? Bình luận mã sản phẩm, ví dụ <strong>A001 x1</strong></p>
          </div>

          <div className={styles.commentList}>
            {comments.map((comment, index) => (
              <div className={styles.comment} key={comment.name}>
                <span className={`${styles.avatar} ${styles[`avatar${index + 1}`] ?? ""}`}>
                  {comment.name.charAt(0)}
                </span>
                <div className={styles.commentBody}>
                  <div className={styles.commentMeta}>
                    <strong>{comment.name}</strong><time>{["vừa xong", "1 phút trước", "2 phút trước"][index]}</time>
                  </div>
                  <p>{comment.content}</p>
                </div>
              </div>
            ))}
          </div>

          <form className={styles.chatForm} onSubmit={handleComment}>
            <Input
              label="Bình luận của bạn"
              placeholder="Hỏi shop hoặc chốt đơn..."
              value={message}
              maxLength={500}
              onChange={(event) => setMessage(event.target.value)}
            />
            <Button type="submit" disabled={!message.trim()}>
              <Send size={16} /> Gửi bình luận
            </Button>
            <p className={styles.notice} role="status">{notice}</p>
          </form>
        </aside>
      </div>

      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? "Chi tiết sản phẩm"}
      >
        <p>Mã sản phẩm: {selected?.id}</p>
        <p className="price">{selected && formatMoney(selected.price)}</p>
        <p>Đây là dữ liệu minh họa. Chưa hỗ trợ đặt hàng hoặc thanh toán.</p>
        <Button disabled>Đặt hàng — sắp có</Button>
      </Dialog>
    </div>
  );
}
