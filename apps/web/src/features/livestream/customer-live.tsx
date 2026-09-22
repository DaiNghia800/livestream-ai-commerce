"use client";
import { useState } from "react";
import { Radio, Shirt, Sparkles } from "lucide-react";
import { products, comments } from "@/mocks/commerce";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
export function CustomerLive() {
  const [selected, setSelected] = useState<(typeof products)[number] | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  return (
    <>
      <div className="demo-banner">
        Bản mẫu giao diện · Video, bình luận và sản phẩm là dữ liệu minh họa.
      </div>
      <div className="live-grid">
        <section>
          <div className="video-placeholder">
            <Badge tone="danger">PHIÊN MẪU</Badge>
            <div className="video-center">
              <Radio size={64} aria-hidden="true" />
              <h2>ChicStyle Official Live</h2>
              <p>Không gian phát livestream</p>
              <span>Video sẽ được kết nối ở giai đoạn tích hợp</span>
            </div>
            <div className="video-caption">
              Bộ sưu tập Linen mùa hè · ChicStyle Official
            </div>
          </div>
          <div className="section-heading">
            <div>
              <p className="eyebrow">CHICSTYLE OFFICIAL</p>
              <h1>Đại tiệc Flash Sale BST Linen</h1>
              <p>Khám phá sản phẩm và trải nghiệm giao diện đặt hàng.</p>
            </div>
          </div>
          <h2>
            Sản phẩm trong phiên live <Badge>{products.length} mặt hàng</Badge>
          </h2>
          <div className="product-grid">
            {products.map((product) => (
              <Card key={product.id}>
                <div className={`product-art ${product.color}`}>
                  <Shirt size={64} strokeWidth={1} aria-hidden="true" />
                  <span>{product.id}</span>
                </div>
                <h3>{product.name}</h3>
                <p className="price">{formatMoney(product.price)}</p>
                <p className="muted">Còn {product.stock} sản phẩm · Minh họa</p>
                <Button onClick={() => setSelected(product)}>
                  Xem {product.id}
                </Button>
              </Card>
            ))}
          </div>
        </section>
        <aside className="chat-panel">
          <div className="section-heading">
            <h2>Bình luận trong phiên</h2>
            <Sparkles size={20} aria-hidden="true" />
          </div>
          <div className="chat-hint">
            Ví dụ cú pháp: <strong>A001 x1</strong>. Chức năng nhận diện đơn sẽ
            được nhóm AI tích hợp sau.
          </div>
          <div className="comments">
            {comments.map((comment) => (
              <div className="comment" key={comment.name}>
                <strong>{comment.name}</strong>
                <p>{comment.content}</p>
              </div>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setNotice(
                "Đây là bản mẫu. Bình luận chưa được gửi lên hệ thống.",
              );
              setMessage("");
            }}
          >
            <Input
              label="Bình luận của bạn"
              placeholder="Nhập bình luận…"
              value={message}
              maxLength={500}
              onChange={(event) => setMessage(event.target.value)}
            />
            <Button type="submit" disabled={!message.trim()}>
              Thử gửi bình luận
            </Button>
            <p role="status" className="muted">
              {notice}
            </p>
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
    </>
  );
}
