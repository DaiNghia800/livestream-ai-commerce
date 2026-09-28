import {
  Radio,
  Cpu,
  Package,
  Truck,
  Zap,
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

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="auth-stat">
      <span className="auth-stat-value">{value}</span>
      <span className="auth-stat-label">{label}</span>
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
          Hạ tầng Livestream bán hàng thế hệ mới &amp; Chốt đơn tự động bằng AI
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

      <div className="auth-stats-row">
        <StatItem value="3.4M" label="Comment xử lý" />
        <StatItem value="99.89%" label="Tỉ lệ uptime" />
        <StatItem value="0.35s" label="Tốc độ phản hồi" />
      </div>

      <div className="auth-quote">
        <Zap size={14} />
        <span>
          &ldquo;LiveOrder AI giúp team tôi tiết kiệm 4,500 giờ nhân công/tháng
          cho việc chốt đơn Livestream Thời trang&rdquo;
        </span>
      </div>
    </div>
  );
}
