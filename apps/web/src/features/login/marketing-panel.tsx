import {
  Radio,
  Cpu,
  Package,
  Truck,
  CheckCircle,
  Activity,
} from "lucide-react";

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="auth-feature-card">
      <div className="auth-feature-icon">{icon}</div>
      <div>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function MarketingPanel() {
  return (
    <div className="auth-marketing">
      <div className="auth-status-row">
        <span className="auth-status-badge auth-status-ok">
          <CheckCircle size={12} />
          Hạ tầng Livestream tương tác đa nền tảng
        </span>
        <span className="auth-status-badge auth-status-ok">
          <Activity size={12} />
          Trạng thái kết nối AI: Khả dụng
        </span>
      </div>

      <div className="auth-hero">
        <span className="auth-hero-eyebrow">SỨC MẠNH KIẾN TRÚC PHÂN TÁN</span>
        <h2>
          Hạ tầng livestream bán hàng thế hệ mới
          <span>Chốt đơn tự động bằng AI</span>
        </h2>
        <p>
          Giải pháp công nghệ chuyên biệt cho phiên live quy mô lớn. Xử lý đồng
          thời 100,000+ comment/phút, kiểm soát tồn kho tức thì và đẩy đơn vận
          chuyển tự động.
        </p>
      </div>

      <div className="auth-features-grid">
        <FeatureCard
          icon={<Radio size={20} />}
          title="Amazon IVS Broadcast"
          description="Độ trễ cực thấp (Ultra-Low Latency), truyền tải mượt mà & hỗ trợ nhiều người xem đồng thời"
        />
        <FeatureCard
          icon={<Cpu size={20} />}
          title="Google Gemini AI Engine"
          description="Phân tích và xử lý ngôn ngữ chat realtime, tự động chốt đơn, xử lý sửa/huỷ đơn"
        />
        <FeatureCard
          icon={<Package size={20} />}
          title="WMS &amp; Khóa tồn"
          description="Quản lý sản phẩm tồn kho, trừ tồn tự động khi có đơn & tự khôi phục khi hủy"
        />
        <FeatureCard
          icon={<Truck size={20} />}
          title="Thanh toán &amp; Vận chuyển"
          description="Tích hợp sẵn cổng thanh toán QR, MoMo, ZaloPay & tạo vận đơn GHN, GHTK tự động"
        />
      </div>

    </div>
  );
}
