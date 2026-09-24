import Link from "next/link";
import { ChevronRight, Package, Plus, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { liveSession, liveSessionMetrics, liveSessionProducts } from "@/mocks/live-session";
import styles from "./merchant-live-detail.module.css";

function statusTone(status: string) {
  if (status === "Đang ghim") return "success" as const;
  if (status === "Sắp cháy hàng") return "warning" as const;
  return "neutral" as const;
}

export function MerchantLiveDetail() {
  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <nav className={styles.breadcrumb} aria-label="Đường dẫn trang">
            <Link href="/shop">Tổng quan</Link>
            <ChevronRight size={14} aria-hidden="true" />
            <span>Chi tiết phiên #{liveSession.id}</span>
          </nav>
          <div className={styles.titleRow}>
            <h1>{liveSession.title}</h1>
            <Badge tone="success">PHIÊN MẪU</Badge>
          </div>
          <p className="muted">Thông tin minh họa để nhóm phát triển màn quản lý phiên bán.</p>
        </div>
        <div className={styles.actions} aria-label="Thao tác phiên livestream">
          <Button variant="secondary" disabled title="Chỉnh sửa phiên chưa khả dụng">
            Chỉnh sửa phiên · Sắp có
          </Button>
          <Button variant="secondary" disabled title="Thiết lập camera chưa khả dụng">
            <Video size={17} aria-hidden="true" /> Thiết lập Camera · Sắp có
          </Button>
        </div>
      </header>

      <section className={styles.metrics} aria-label="Số liệu phiên livestream">
        {liveSessionMetrics.map((metric) => (
          <Card
            className={`${styles.metric} ${"tone" in metric ? styles[metric.tone] : ""}`}
            key={metric.label}
          >
            <span className={styles.metricLabel}>{metric.label}</span>
            <strong className={styles.metricValue}>{metric.value}</strong>
            <p className={styles.metricNote}>{metric.note}</p>
          </Card>
        ))}
      </section>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>
            <Package size={19} aria-hidden="true" />
            Sản phẩm trong phiên
            <Badge>{liveSessionProducts.length}</Badge>
          </h2>
          <div className={styles.panelTools}>
            <Button variant="secondary" disabled title="Ghim sản phẩm chưa khả dụng">
              <Plus size={17} aria-hidden="true" /> Ghim thêm mã · Sắp có
            </Button>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">Danh sách sản phẩm mẫu trong phiên livestream</caption>
            <thead>
              <tr>
                <th scope="col">STT</th>
                <th scope="col">Tên sản phẩm</th>
                <th scope="col">SKU</th>
                <th scope="col">Mã chốt đơn</th>
                <th scope="col">Giá bán live</th>
                <th scope="col">Tồn khả dụng</th>
                <th scope="col">Đơn từ chat</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {liveSessionProducts.map((product, index) => (
                <tr key={product.id}>
                  <td className={styles.number} data-label="STT">
                    {String(index + 1).padStart(2, "0")}
                  </td>
                  <td data-label="Sản phẩm">
                    <span className={styles.productName}>
                      <strong>{product.name}</strong>
                      <small>Dữ liệu sản phẩm minh họa</small>
                    </span>
                  </td>
                  <td className={styles.sku} data-label="SKU">{product.sku}</td>
                  <td data-label="Mã chốt đơn"><span className={styles.productCode}>{product.id}</span></td>
                  <td className={styles.number} data-label="Giá live">{formatMoney(product.price)}</td>
                  <td className={styles.number} data-label="Tồn kho">{product.inventory}</td>
                  <td className={`${styles.number} ${styles.orders}`} data-label="Đơn từ chat">{product.orders} đơn</td>
                  <td data-label="Trạng thái"><Badge tone={statusTone(product.status)}>{product.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.panelFooter}>
          Hiển thị {liveSessionProducts.length} sản phẩm mẫu. Chưa kết nối tồn kho hoặc AI.
        </p>
      </Card>
    </>
  );
}
