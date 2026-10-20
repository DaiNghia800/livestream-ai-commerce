/**
 * Tách một dòng địa chỉ khách gõ thành các trường hãng vận chuyển cần.
 *
 * Khách bình luận trên live gõ địa chỉ thành MỘT dòng tự do, còn API
 * hãng đòi tỉnh và phường ở hai trường riêng, tên khớp đúng danh mục
 * của họ. Đây là chỗ bắc cầu giữa hai thứ đó.
 *
 * ── NGUYÊN TẮC: THÀ KHÔNG BIẾT CÒN HƠN ĐOÁN SAI ──
 *
 * Mọi trường hợp không chắc chắn đều trả `daChuanHoa: false` kèm lý
 * do, để màn đơn hàng cảnh báo và người sửa tay. Đoán bừa cho đẹp số
 * liệu là cách tạo ra lỗi tệ nhất trong cả hệ thống: hàng đi lạc
 * tỉnh, mà người gõ lẫn người giao đều thấy địa chỉ hợp lệ, nên chỉ
 * lộ ra khi khách gọi điện hỏi hàng đâu.
 *
 * Và chuẩn hoá phải chạy NGAY khi đơn được xác nhận, không đợi tới
 * lúc bấm tạo vận đơn — lúc đó shop đang vội đẩy 50 đơn cuối phiên,
 * phát hiện địa chỉ hỏng là quá muộn.
 */

import { traTinh, type TenTinh } from "./vietnam-provinces.js";

/** Vì sao một địa chỉ chưa dùng được. Dùng làm nội dung cảnh báo. */
export type LyDoChuaChuan =
  | "THIEU_TINH"
  | "TINH_LA"
  | "TINH_DA_SAP_NHAP"
  | "THIEU_PHUONG_XA"
  | "THIEU_SO_NHA";

export const MO_TA_LY_DO: Record<LyDoChuaChuan, string> = {
  THIEU_TINH: "Không tìm thấy tỉnh/thành trong địa chỉ",
  TINH_LA: "Tỉnh/thành không nằm trong danh mục 34 đơn vị hiện hành",
  TINH_DA_SAP_NHAP: "Tỉnh/thành này đã sáp nhập, cần xác nhận tên mới",
  THIEU_PHUONG_XA: "Không tìm thấy phường/xã trong địa chỉ",
  THIEU_SO_NHA: "Không tìm thấy số nhà hoặc tên đường",
};

export interface DiaChiDaTach {
  daChuanHoa: boolean;
  provinceName: string;
  districtName: string | null;
  wardName: string;
  streetLine: string;
  /** false = địa chỉ 3 cấp kiểu cũ, còn tên quận/huyện. */
  isNewFormat: boolean;
  lyDo: LyDoChuaChuan[];
  /** Tên tỉnh mới đề nghị, khi khách gõ tên tỉnh đã sáp nhập. */
  goiYTinh: TenTinh | null;
}

const DAU_PHUONG_XA = /^(phuong|xa|thi tran|p|tt)\b/;
const DAU_QUAN_HUYEN = /^(quan|huyen|thi xa|q|h|tx)\b/;

/** Bỏ dấu để nhận dạng tiền tố, bản gốc vẫn giữ nguyên để lưu. */
function boDau(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tachDiaChi(nguyenVan: string): DiaChiDaTach {
  const lyDo: LyDoChuaChuan[] = [];

  const doan = nguyenVan
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  // ── Tỉnh/thành: luôn là đoạn cuối cùng ───────────────────────────
  let provinceName = "";
  let goiYTinh: TenTinh | null = null;
  let viTriTinh = -1;

  // Quét ngược: có người viết thừa "Việt Nam" ở cuối.
  for (let i = doan.length - 1; i >= 0 && i >= doan.length - 2; i -= 1) {
    const kq = traTinh(doan[i]);
    if (kq.tinh) {
      provinceName = kq.tinh;
      viTriTinh = i;
      break;
    }
    if (kq.goiY) {
      goiYTinh = kq.goiY;
      viTriTinh = i;
      lyDo.push("TINH_DA_SAP_NHAP");
      break;
    }
  }

  if (!provinceName && !goiYTinh) {
    lyDo.push(doan.length < 2 ? "THIEU_TINH" : "TINH_LA");
    viTriTinh = doan.length - 1;
  }

  // Các đoạn còn lại nằm trước tỉnh.
  const conLai = doan.slice(0, viTriTinh >= 0 ? viTriTinh : doan.length);

  // ── Quận/huyện: có mặt nghĩa là địa chỉ kiểu CŨ ba cấp ───────────
  //
  // Không tự xoá quận/huyện khỏi địa chỉ cũ. Hãng vẫn nhận cả hai
  // kiểu, và địa chỉ cũ thì bưu tá quen thuộc hơn. Việc của ta chỉ là
  // nhận ra đang ở kiểu nào để gửi đúng cờ.
  let districtName: string | null = null;
  const viTriQuan = conLai.findIndex((d) => DAU_QUAN_HUYEN.test(boDau(d)));
  if (viTriQuan >= 0) {
    districtName = conLai[viTriQuan];
  }

  // ── Phường/xã ────────────────────────────────────────────────────
  let wardName = "";
  const viTriPhuong = conLai.findIndex((d) => DAU_PHUONG_XA.test(boDau(d)));
  if (viTriPhuong >= 0) {
    wardName = conLai[viTriPhuong];
  } else {
    lyDo.push("THIEU_PHUONG_XA");
  }

  // ── Số nhà và tên đường: mọi đoạn còn lại ────────────────────────
  const streetLine = conLai
    .filter((_, i) => i !== viTriPhuong && i !== viTriQuan)
    .join(", ");

  if (!streetLine) {
    lyDo.push("THIEU_SO_NHA");
  }

  return {
    daChuanHoa: lyDo.length === 0,
    provinceName,
    districtName,
    wardName,
    streetLine,
    // Không có quận/huyện = địa chỉ hai cấp sau sáp nhập.
    isNewFormat: districtName === null,
    lyDo,
    goiYTinh,
  };
}

/** Gộp lý do thành một câu để hiện lên giao diện. */
export function moTaLyDo(lyDo: LyDoChuaChuan[]): string {
  return lyDo.map((l) => MO_TA_LY_DO[l]).join("; ");
}
