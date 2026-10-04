"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Bold,
  Bot,
  Check,
  ChevronRight,
  CloudUpload,
  CreditCard,
  Eye,
  History,
  Image as ImageIcon,
  Info,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Package,
  Pin,
  Plus,
  Save,
  SlidersHorizontal,
  Truck,
  Underline,
  Wifi,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { productMockList } from "@/mocks/product";
import styles from "./product.module.css";

interface EditProductPageProps {
  productId: string;
}

const variants = [
  { option: "Trắng / M", sku: "A001-WHT-M", code: "A001TM", stock: 50, available: 38, reserved: 12 },
  { option: "Trắng / L", sku: "A001-WHT-L", code: "A001TL", stock: 65, available: 50, reserved: 15 },
  { option: "Đen / M", sku: "A001-BLK-M", code: "A001DM", stock: 80, available: 62, reserved: 18 },
  { option: "Đen / XL", sku: "A001-BLK-XL", code: "A001DXL", stock: 45, available: 35, reserved: 10 },
  { option: "Be / L", sku: "A001-BEI-L", code: "A001BL", stock: 110, available: 80, reserved: 30 },
];

const gallery = [
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuCQ7ZY3ITNXKaAHm92cuJOIoaKZ2CSv-rOSPvul9oYQReQS0QLEIYMGbrFardxvQl09WuIcLEVHtHvvSp2zjRdCYqUflqktI34xRRvIZXVT7OHIwfc05D-If_zR_j6mWqZAER0i0ZoKV02rpROjg0HcxpSVCOE239L1y-VYUD9NUgeY-hV47Hd0LFjJFaB868t2rwYLBOmb_gFGJ9h5CPYApk-gXym3z30NeRLfvFCGP-RTtv8ZjOtc",
    alt: "Áo sơ mi linen trắng chụp chính diện",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuDEg1SGksgM-MQkOHHITXWqNoWutdZA2DLa63rIzM7aj6fAz-6WRALFJZ42maeIRMgdLfGdMLpjQl1dovlO_48y_0gBwa0mo4XRW-9SCHmU4fXlqwrTSvi9kq2CA3d3-wU1vukJHIJYasUSejI2yJEwAcR00dReUlOq1ZplrzWbRQuUou3H_SOi6S8OFa-wZjMM1y3MasqUfjJ_cxV8DiIwurGsXEHf5a2ZQfSfHUMHSj9wfbdRk0Vl",
    alt: "Cận cảnh chất vải linen tự nhiên",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuCtPglpSh0aBMPtLfs-lZuVnbNhC6H9S2hCOQglCvaw2vua3y93H2vqqXJPrT9o-0MxNIoHjf9poL4nBLrKRm3At-xFr3qQm-vpQ69ododABR6V5nXwXfGjo4lv7Q9JZp742-u-yC-f5GszknEFraFD-xa5IqWovHDMoIstGeo7hX1xXwVhE1FirDfn6hi6-v0S-NRbSDqrR0iDnk3p3Pooxy-RttY8yrWr3XsX559IgtU8bxdZUxsr",
    alt: "Áo linen cổ tàu trong ảnh phong cách đời thường",
  },
];

const inputClass =
  "h-10 w-full min-w-0 rounded-lg border border-outline-variant bg-surface-container-lowest px-3.5 text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-label-md font-semibold text-on-surface";
const cardClass =
  "min-w-0 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm !p-4 md:!p-5";

function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "neutral" | "success" | "warning" | "error";
}) {
  const tones = {
    neutral: "border-outline-variant bg-white text-on-surface-variant",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-rose-200 bg-rose-50 text-rose-800",
  };
  return (
    <div className={`min-w-0 rounded-lg border p-3 ${tones[tone]}`}>
      <span className="block text-[10px] leading-tight">{label}</span>
      <strong className="mt-1 block font-headline-lg text-2xl leading-8">
        {value}<small className="ml-1 font-body-md text-[11px] font-normal">cái</small>
      </strong>
      <span className="mt-1 block text-[10px] leading-tight">{note}</span>
    </div>
  );
}

function VariantTable() {
  return (
    <div className="custom-scrollbar overflow-x-auto rounded-lg border border-outline-variant">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="border-b border-outline-variant bg-surface-container-low text-[10px] font-semibold uppercase text-outline">
            <th className="px-3 py-2.5">Phân loại</th><th className="px-3 py-2.5">Mã SKU</th>
            <th className="px-3 py-2.5">Mã phụ AI</th><th className="px-3 py-2.5 text-right">Tổng tồn</th>
            <th className="px-3 py-2.5 text-right">Khả dụng</th><th className="px-3 py-2.5 text-right">Đang giữ</th>
            <th className="px-3 py-2.5 text-right">Giá Live</th><th className="px-3 py-2.5 text-center">Trạng thái</th>
            <th className="px-3 py-2.5 text-center">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/60 text-body-sm">
          {variants.map((variant) => (
            <tr className="hover:bg-surface-container-low/60" key={variant.sku}>
              <td className="px-3 py-3 font-semibold">
                <span className={`mr-2 inline-block h-3 w-3 rounded-full border ${variant.option.startsWith("Đen") ? "border-slate-900 bg-slate-900" : variant.option.startsWith("Be") ? "border-amber-300 bg-amber-200" : "border-slate-300 bg-slate-100"}`} />
                {variant.option}
              </td>
              <td className="px-3 py-3 font-mono text-xs text-on-surface-variant">{variant.sku}</td>
              <td className="px-3 py-3"><span className="rounded bg-surface-container px-1.5 py-0.5 font-mono text-xs font-bold text-primary">{variant.code}</span></td>
              <td className="px-3 py-3 text-right">{variant.stock}</td>
              <td className="px-3 py-3 text-right font-bold text-emerald-700">{variant.available}</td>
              <td className="px-3 py-3 text-right font-medium text-amber-700">{variant.reserved}</td>
              <td className="px-3 py-3 text-right font-bold">289.000 đ</td>
              <td className="px-3 py-3 text-center"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Đang bán</span></td>
              <td className="px-3 py-3 text-center"><button aria-label={`Chỉnh sửa biến thể ${variant.option}`} className="rounded p-1 text-on-surface-variant hover:text-primary" type="button"><SlidersHorizontal size={16} aria-hidden="true" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EditProductPage({ productId }: EditProductPageProps) {
  const router = useRouter();
  const product = productMockList.find((item) => item.id === productId) ?? productMockList[0];
  const [name, setName] = useState("Áo Sơ Mi Linen Cổ Tàu Cao Cấp");
  const [status, setStatus] = useState("active");
  const [toastVisible, setToastVisible] = useState(false);

  const handleSave = () => {
    setToastVisible(true);
    window.setTimeout(() => setToastVisible(false), 3500);
  };

  return (
    <div className="min-w-0">
      <div className="sticky top-0 z-10 -mx-4 mb-5 border-b border-outline-variant bg-surface-container-lowest/95 px-4 py-4 shadow-sm backdrop-blur md:-mx-8 md:px-8">
        <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1.5 text-label-sm text-on-surface-variant">
              <Link className="hover:text-primary" href="/shop/products">Sản phẩm</Link><ChevronRight size={14} aria-hidden="true" />
              <Link className="hover:text-primary" href="/shop/products">Quản lý Sản phẩm</Link><ChevronRight size={14} aria-hidden="true" />
              <span className="font-semibold text-on-surface">Chỉnh sửa #{productId}-LNN</span>
            </nav>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">Chỉnh sửa sản phẩm</h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-label-sm font-semibold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> ĐANG BÁN</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="h-10 rounded-lg border border-outline-variant bg-white px-4 text-label-md font-semibold text-on-surface hover:bg-surface-container-low" type="button" onClick={() => router.push("/shop/products")}>Hủy</button>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary/20 bg-surface-container-low px-3.5 text-label-md font-semibold text-primary hover:bg-surface-container" type="button"><Eye size={16} aria-hidden="true" /> Xem trên Livestream</button>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary-container px-4 text-label-md font-semibold text-on-primary shadow-sm hover:bg-primary" type="button" onClick={handleSave}><Save size={16} aria-hidden="true" /> Lưu thay đổi</button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-5 xl:col-span-8">
          <Card className="!p-4 md:!p-6">
            <div className="mb-5 flex items-center justify-between gap-3 border-b border-outline-variant pb-4">
              <div className="flex items-center gap-2"><Info size={20} className="text-primary" aria-hidden="true" /><h2 className="font-title-sm text-title-sm font-semibold">1. Thông tin chung</h2></div>
              <span className="shrink-0 rounded bg-surface-container-low px-2 py-0.5 text-label-sm text-on-surface-variant">ID: PRD-2025-{productId}</span>
            </div>
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2"><label className={labelClass} htmlFor="product-name">Tên sản phẩm <span className="text-error">*</span></label><span className="text-label-sm text-on-surface-variant">{name.length} / 120 ký tự</span></div>
                <input id="product-name" className={inputClass} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className={labelClass} htmlFor="category">Danh mục hàng hóa <span className="text-error">*</span></label><select id="category" className={inputClass} defaultValue="shirts"><option value="shirts">Thời trang Nam / Sơ mi cao cấp</option><option>Thời trang Nam / Áo Thun Cổ Tròn</option><option>Thời trang Nam / Quần Tây Công Sở</option></select></div>
                <div><label className={labelClass} htmlFor="brand">Thương hiệu / Nhãn hiệu</label><input id="brand" className={inputClass} defaultValue="Linen Heritage Vietnam" /></div>
              </div>
              <div>
                <label className={labelClass} htmlFor="description">Mô tả chi tiết sản phẩm</label>
                <div className="overflow-hidden rounded-lg border border-outline-variant">
                  <div className="flex flex-wrap items-center gap-1 border-b border-outline-variant bg-surface-container-low px-3 py-2 text-on-surface-variant">
                    {[{ Icon: Bold, label: "In đậm" }, { Icon: Italic, label: "In nghiêng" }, { Icon: Underline, label: "Gạch chân" }, { Icon: List, label: "Danh sách" }, { Icon: ListOrdered, label: "Danh sách đánh số" }, { Icon: LinkIcon, label: "Thêm liên kết" }, { Icon: ImageIcon, label: "Thêm hình ảnh" }].map(({ Icon, label }) => <button aria-label={label} className="flex h-7 w-7 items-center justify-center rounded hover:bg-surface-container" key={label} type="button"><Icon size={15} aria-hidden="true" /></button>)}
                    <span className="ml-auto text-label-sm">Hỗ trợ Markdown AI</span>
                  </div>
                  <textarea id="description" className="min-h-32 w-full resize-y border-0 bg-white p-3.5 text-body-md leading-relaxed text-on-surface outline-none focus:ring-0" defaultValue={"Chất liệu 100% Linen dệt sợi tự nhiên cao cấp, thoáng khí và thấm hút mồ hôi tối đa trong điều kiện thời tiết nóng ẩm.\nPhom dáng Regular-fit sang trọng kết hợp cổ Tàu (Mandarin collar) cách tân hiện đại, đường may cuộn mép tinh xảo theo tiêu chuẩn xuất khẩu.\nHướng dẫn giặt ủi: Giặt tay bằng nước lạnh hoặc giặt máy chế độ nhẹ, không dùng chất tẩy mạnh, ủi ở nhiệt độ trung bình khi vải còn ẩm."} />
                </div>
              </div>
            </div>
          </Card>

          <Card className="!p-4 md:!p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant pb-4"><div className="flex items-center gap-2"><CreditCard size={20} className="text-primary" aria-hidden="true" /><h2 className="font-title-sm text-title-sm font-semibold">2. Giá bán &amp; Tồn kho WMS</h2></div><span className="inline-flex items-center gap-1 rounded bg-secondary-fixed px-2.5 py-1 text-label-sm font-semibold text-on-secondary-fixed"><Wifi size={14} aria-hidden="true" /> Đang áp dụng phiên Live #LIVE-2025-08</span></div>
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-outline-variant/60 bg-surface-container-low p-3.5"><label className={labelClass} htmlFor="listed-price">Giá niêm yết (VND)</label><input id="listed-price" className={inputClass} defaultValue="450.000 đ" /></div>
              <div className="rounded-lg border border-primary/30 bg-primary-fixed/20 p-3.5"><div className="mb-1 flex items-center justify-between gap-2"><label className="text-label-md font-semibold text-primary" htmlFor="live-price">Giá Flash Live (VND)</label><span className="rounded-full bg-error px-2 py-0.5 text-[10px] font-bold text-white">-35% GIẢM</span></div><input id="live-price" className={`${inputClass} border-primary font-title-sm font-bold text-primary`} defaultValue="289.000 đ" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"><Metric label="Tổng tồn kho nhập" value="350" note="Phân bổ 5 biến thể" tone="neutral" /><Metric label="Tồn khả dụng (Available)" value="265" note="Sẵn sàng chốt live" tone="success" /><Metric label="Đang giữ giỏ (Reserved)" value="85" note="Khách đang chốt đơn" tone="warning" /><Metric label="Ngưỡng cảnh báo hết" value="15" note="Tự động báo Host" tone="error" /></div>
          </Card>

          <Card className="!p-4 md:!p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant pb-4"><div className="flex items-start gap-2"><Bot size={21} className="mt-0.5 shrink-0 text-secondary" aria-hidden="true" /><div><h2 className="font-title-sm text-title-sm font-semibold">3. Thiết lập Mã Chốt Đơn AI (Order Trigger &amp; Gemini NLP)</h2><p className="mt-0.5 text-body-sm text-on-surface-variant">Bóc tách bình luận tự động theo ngữ nghĩa thời gian thực</p></div></div><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-label-sm font-semibold text-emerald-800"><Check size={13} aria-hidden="true" /> Hợp lệ, đang hoạt động</span></div>
            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div><label className={labelClass} htmlFor="trigger-code">Mã chốt đơn chính (Keyword)</label><div className={`${styles.editTriggerCodeField} flex items-center rounded-lg border-2 border-primary bg-white pl-3.5 text-primary`}><span className="shrink-0 font-bold">#</span><input id="trigger-code" className={`${styles.editTriggerCodeInput} min-w-0 border-0 bg-transparent px-2 font-title-sm font-bold text-primary outline-none focus:ring-0`} defaultValue="AO01" /></div></div>
              <div className="sm:col-span-2"><label className={labelClass}>Trạng thái nhận diện AI</label><div className="flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant/60 bg-surface-container-low px-3.5 py-2 text-body-sm text-on-surface-variant"><span className="inline-flex items-center gap-2"><BadgeCheck size={17} className="text-primary" aria-hidden="true" /> Gemini 1.5 Flash Parser: Độ nhạy 99.4%</span><strong className="text-label-sm text-primary">Đã kiểm thử</strong></div></div>
            </div>
            <div className="mb-5"><p className={labelClass}>Các mẫu cú pháp AI tự động bóc tách (Tiếng Việt Tự Nhiên)</p><div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">{[{ title: "Mẫu 1: Mã + Số lượng", text: '"AO01 2 cái"', result: "SKU mặc định (M) x2" }, { title: "Mẫu 2: Khẩu ngữ mua hàng", text: '"Lấy 1 cái AO01 nha"', result: "Khớp mã #AO01 x1" }, { title: "Mẫu 3: Đầy đủ tham số", text: '"AO01 Đen XL 0912345678"', result: "Khớp SKU & tạo giỏ ngay" }].map((example) => <div className="min-w-0 rounded-lg border border-outline-variant/60 bg-surface-container-low p-3" key={example.title}><span className="mb-1 block text-label-sm font-semibold text-primary">{example.title}</span><p className="rounded border border-outline-variant/40 bg-white p-2 font-mono text-xs text-on-surface">{example.text}</p><span className="mt-1.5 block text-[11px] text-on-surface-variant">→ {example.result}</span></div>)}</div></div>
            <label className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant/80 bg-surface-container-low p-3.5"><span className="flex items-start gap-3 text-label-md text-on-surface"><input aria-label="Tự động giữ tồn kho 15 phút" defaultChecked className={`${styles.editInlineCheckbox} mt-0.5 accent-primary`} type="checkbox" /><span>Tự động giữ tồn kho <strong>15 phút</strong> khi phát hiện bình luận hợp lệ để khách hoàn tất SĐT &amp; địa chỉ.</span></span><span className="text-label-sm font-semibold text-secondary">Khuyến nghị</span></label>
          </Card>

          <Card className="!p-4 md:!p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant pb-4"><div><h2 className="font-title-sm text-title-sm font-semibold">4. Bảng cấu hình biến thể &amp; SKU riêng</h2><p className="mt-0.5 text-body-sm text-on-surface-variant">5 SKU đang hoạt động đồng bộ với kho WMS và bot livestream</p></div><button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-fixed px-3 text-label-md font-semibold text-on-primary-fixed hover:bg-primary-fixed-dim" type="button"><Plus size={15} aria-hidden="true" /> Thêm biến thể mới</button></div>
            <VariantTable />
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-5 xl:col-span-4">
          <Card className={cardClass}>
            <h2 className="mb-3 flex items-center gap-2 font-title-sm text-title-sm font-semibold"><Package size={18} className="text-primary" aria-hidden="true" />1. Trạng thái bán hàng</h2>
            <div className="space-y-2">{[{ value: "active", title: "Đang bán (Active)", detail: "Hiển thị trong giỏ livestream và cho phép chốt đơn AI" }, { value: "draft", title: "Nháp (Draft)", detail: "Chỉ hiển thị với quản trị viên" }, { value: "inactive", title: "Ngừng bán (Inactive)", detail: "Khóa mã chốt đơn bot và ẩn khỏi catalog" }].map((option) => <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${status === option.value ? "border-2 border-primary bg-primary-fixed/10" : "border-outline-variant hover:bg-surface-container-low"}`} key={option.value}><input checked={status === option.value} className={`${styles.editStatusRadio} mt-1 accent-primary`} name="product-status" onChange={() => setStatus(option.value)} type="radio" value={option.value} /><span className="min-w-0 flex-1"><strong className="flex items-center gap-1.5 text-label-md">{option.title}{status === option.value && option.value === "active" && <span className="h-2 w-2 rounded-full bg-emerald-500" />}</strong><span className="mt-0.5 block text-[11px] leading-snug text-on-surface-variant">{option.detail}</span></span></label>)}</div>
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-primary/20 bg-surface-container-high p-3"><Pin size={17} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" /><p className="text-body-sm text-on-surface">Sản phẩm đang được <strong>ghim</strong> trong phiên Live <span className="font-semibold text-primary">#LIVE-2025-08</span></p></div>
          </Card>

          <Card className={cardClass}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-title-sm text-title-sm font-semibold"><ImageIcon size={18} className="text-primary" aria-hidden="true" />2. Hình ảnh sản phẩm (3/8)</h2><span className="text-label-sm text-on-surface-variant">Tối đa 5MB / ảnh</span></div>
            <div className="mb-3 grid grid-cols-3 gap-2.5">{gallery.map((image, index) => <div className="group relative aspect-square overflow-hidden rounded-lg border border-outline-variant bg-surface-container" key={image.src}><Image fill unoptimized sizes="(max-width: 1280px) 30vw, 12vw" className="object-cover" src={image.src} alt={image.alt} />{index === 0 && <span className="absolute bottom-1 left-1 rounded bg-inverse-surface/80 px-1 text-[9px] font-semibold text-white">Ảnh bìa</span>}<div className="absolute inset-0 flex items-center justify-center gap-1 bg-inverse-surface/40 opacity-0 transition-opacity group-hover:opacity-100"><button aria-label={`Xem ảnh ${index + 1}`} className="rounded bg-white p-1 text-on-surface" type="button"><Eye size={15} /></button><button aria-label={`Xóa ảnh ${index + 1}`} className="rounded bg-white p-1 text-error" type="button"><X size={15} /></button></div></div>)}</div>
            <label className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-outline-variant p-4 text-center transition-colors hover:bg-surface-container-low"><CloudUpload size={25} className="mb-1 text-primary" aria-hidden="true" /><span className="text-label-md font-semibold">Tải thêm hình ảnh hoặc kéo thả</span><span className="mt-1 text-[11px] text-on-surface-variant">Định dạng JPG, PNG, WEBP (Khuyên dùng tỷ lệ 1:1)</span><input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple /></label>
          </Card>

          <Card className={cardClass}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-title-sm text-title-sm font-semibold"><Truck size={18} className="text-primary" aria-hidden="true" />3. Thuộc tính đóng gói &amp; Vận chuyển</h2><span className="font-mono text-[10px] font-semibold text-primary">GHN / GHTK API</span></div>
            <div className="space-y-3.5"><div><label className={labelClass} htmlFor="weight">Trọng lượng đóng gói (gram)</label><div className="relative"><input id="weight" className={`${inputClass} pr-14`} defaultValue="280" /><span className="absolute right-3 top-3 text-label-sm text-on-surface-variant">gram</span></div></div><div><label className={labelClass}>Kích thước bưu kiện (cm)</label><div className="grid grid-cols-3 gap-2">{[{ label: "D", value: "25" }, { label: "R", value: "18" }, { label: "C", value: "4" }].map((dimension) => <label className="relative" key={dimension.label}><span className="sr-only">{dimension.label}</span><input className={`${inputClass} pr-8`} defaultValue={dimension.value} /><span className="absolute right-2 top-3 text-[11px] text-on-surface-variant">{dimension.label}</span></label>)}</div></div><div className="flex items-center justify-between rounded-lg border border-outline-variant/60 bg-surface-container-low p-3"><div><span className="block text-[11px] text-on-surface-variant">Ước tính cước nội thành HN/HCM</span><strong className="font-title-sm text-title-sm">16.500 đ</strong></div><Truck size={20} className="text-tertiary" aria-hidden="true" /></div></div>
          </Card>

          <Card className={cardClass}>
            <h2 className="mb-3 flex items-center gap-2 font-title-sm text-title-sm font-semibold"><History size={18} className="text-primary" aria-hidden="true" />4. Lịch sử chỉnh sửa &amp; Audit Info</h2>
            <div className="space-y-3 text-body-sm"><div className="flex items-start gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /><div><p className="font-semibold text-on-surface">Lần sửa cuối:</p><p className="text-on-surface-variant">Hôm nay 14:15 bởi <strong>Quản trị viên Tuấn Trần</strong></p></div></div><div className="flex items-start gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-outline" /><div><p className="font-semibold text-on-surface">Tạo sản phẩm:</p><p className="text-on-surface-variant">10/05/2025 bởi Hệ thống WMS Sync</p></div></div><div className="border-t border-outline-variant/50 pt-2"><Link className="flex items-center gap-1 font-semibold text-primary hover:underline" href="/shop/products"><span>Xem lịch sử thay đổi giá &amp; tồn kho (Audit Log #42)</span><ArrowRight size={15} aria-hidden="true" /></Link></div></div>
          </Card>
        </aside>
      </div>

      <div aria-live="polite" className={`fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2.5rem)] items-start gap-3 rounded-lg bg-inverse-surface px-4 py-3 text-inverse-on-surface shadow-xl transition-all ${toastVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-5 opacity-0"}`}>
        <Check size={20} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" /><div><p className="text-label-md font-semibold">Đã lưu thay đổi thành công</p><p className="mt-0.5 text-xs text-outline-variant">Các biến thể SKU và giá Flash Live đã đồng bộ với phòng phát sóng.</p></div>
      </div>
      <span className="sr-only">Sản phẩm: {product.name}</span>
    </div>
  );
}