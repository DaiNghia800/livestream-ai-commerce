/**
 * Danh mục tỉnh/thành sau sáp nhập 01/07/2025 — còn 34 đơn vị.
 *
 * Việt Nam đã bỏ cấp huyện, chuyển từ ba cấp (Tỉnh → Huyện → Xã) sang
 * hai cấp (Tỉnh → Phường/Xã). Đây là lý do mọi hãng vận chuyển đều
 * phải thêm cờ chọn kiểu địa chỉ, và là lý do bảng `addresses` có cột
 * `is_new_format`.
 *
 * ── VÌ SAO TÊN CŨ KHÔNG ĐƯỢC TỰ ĐỘNG ĐỔI SANG TÊN MỚI ──
 *
 * Bảng `TEN_CU_DA_SAP_NHAP` bên dưới CHỈ dùng để GỢI Ý, không bao giờ
 * tự áp. Khách gõ "Bình Dương" thì hệ thống nói "có phải ý bạn là TP.
 * Hồ Chí Minh không?" rồi chờ người xác nhận.
 *
 * Tự đổi thì nhanh hơn, nhưng sai một dòng trong bảng này là hàng đi
 * lạc tỉnh mà không ai biết — người gõ thấy địa chỉ mình nhập vẫn
 * đúng, người giao thấy địa chỉ hệ thống đưa cũng hợp lệ. Lỗi loại
 * này chỉ lộ ra khi khách gọi điện hỏi hàng đâu.
 *
 * Dữ liệu dựng theo thông tin công khai tại thời điểm viết. Trước khi
 * chạy thật nên đối chiếu lại với danh mục của chính hãng vận chuyển,
 * vì đó mới là bảng mà họ dùng để nhận đơn.
 */

/** 34 tỉnh/thành hiện hành. */
export const TINH_THANH = [
  "An Giang",
  "Bắc Ninh",
  "Cà Mau",
  "Cao Bằng",
  "Cần Thơ",
  "Đà Nẵng",
  "Đắk Lắk",
  "Điện Biên",
  "Đồng Nai",
  "Đồng Tháp",
  "Gia Lai",
  "Hà Nội",
  "Hà Tĩnh",
  "Hải Phòng",
  "Huế",
  "Hưng Yên",
  "Khánh Hòa",
  "Lai Châu",
  "Lâm Đồng",
  "Lạng Sơn",
  "Lào Cai",
  "Nghệ An",
  "Ninh Bình",
  "Phú Thọ",
  "Quảng Ngãi",
  "Quảng Ninh",
  "Quảng Trị",
  "Sơn La",
  "Tây Ninh",
  "Thái Nguyên",
  "Thanh Hóa",
  "TP. Hồ Chí Minh",
  "Tuyên Quang",
  "Vĩnh Long",
] as const;

export type TenTinh = (typeof TINH_THANH)[number];

/**
 * Cách viết khác của cùng một tỉnh.
 *
 * Khách gõ bình luận trên live không ai viết "TP. Hồ Chí Minh" đầy đủ.
 * Những biến thể này là CÙNG MỘT nơi nên áp thẳng được, khác hẳn với
 * bảng tên cũ bên dưới.
 */
const CACH_VIET_KHAC: Record<string, TenTinh> = {
  "ho chi minh": "TP. Hồ Chí Minh",
  "tp ho chi minh": "TP. Hồ Chí Minh",
  "thanh pho ho chi minh": "TP. Hồ Chí Minh",
  hcm: "TP. Hồ Chí Minh",
  tphcm: "TP. Hồ Chí Minh",
  "tp hcm": "TP. Hồ Chí Minh",
  "sai gon": "TP. Hồ Chí Minh",
  sg: "TP. Hồ Chí Minh",
  "ha noi": "Hà Nội",
  hn: "Hà Nội",
  "thu do ha noi": "Hà Nội",
  "tp ha noi": "Hà Nội",
  "hai phong": "Hải Phòng",
  "tp hai phong": "Hải Phòng",
  "da nang": "Đà Nẵng",
  "tp da nang": "Đà Nẵng",
  dn: "Đà Nẵng",
  "can tho": "Cần Thơ",
  "tp can tho": "Cần Thơ",
  "thua thien hue": "Huế",
  "tp hue": "Huế",
};

/**
 * Tỉnh CŨ đã sáp nhập vào tỉnh nào.
 *
 * Chỉ để gợi ý cho người dùng xác nhận — xem phần giải thích ở đầu
 * file. Đừng bao giờ dùng bảng này để tự sửa dữ liệu.
 */
export const TEN_CU_DA_SAP_NHAP: Record<string, TenTinh> = {
  "binh duong": "TP. Hồ Chí Minh",
  "ba ria vung tau": "TP. Hồ Chí Minh",
  "vung tau": "TP. Hồ Chí Minh",
  "hai duong": "Hải Phòng",
  "quang nam": "Đà Nẵng",
  "soc trang": "Cần Thơ",
  "hau giang": "Cần Thơ",
  "kien giang": "An Giang",
  "phu quoc": "An Giang",
  "bac lieu": "Cà Mau",
  "ben tre": "Vĩnh Long",
  "tra vinh": "Vĩnh Long",
  "tien giang": "Đồng Tháp",
  "long an": "Tây Ninh",
  "binh phuoc": "Đồng Nai",
  "dak nong": "Lâm Đồng",
  "binh thuan": "Lâm Đồng",
  "ninh thuan": "Khánh Hòa",
  "phu yen": "Đắk Lắk",
  "binh dinh": "Gia Lai",
  "kon tum": "Quảng Ngãi",
  "quang binh": "Quảng Trị",
  "ha nam": "Ninh Bình",
  "nam dinh": "Ninh Bình",
  "thai binh": "Hưng Yên",
  "bac giang": "Bắc Ninh",
  "bac kan": "Thái Nguyên",
  "vinh phuc": "Phú Thọ",
  "hoa binh": "Phú Thọ",
  "ha giang": "Tuyên Quang",
  "yen bai": "Lào Cai",
};

/**
 * Thành phố / thị xã THUỘC TỈNH, và tỉnh hiện quản lý chúng.
 *
 * Khác hẳn bảng trên: đây chưa bao giờ là tỉnh. Khách quen gõ tên
 * thành phố mình ở ("Nha Trang", "Biên Hòa") vào ô tỉnh, vì trong
 * đời sống đó mới là địa danh người ta dùng. Sau 01/07/2025 cấp
 * huyện bị bỏ hẳn, nên những tên này không còn là đơn vị hành chính
 * nào cả — hãng vận chuyển tra danh mục sẽ không thấy.
 *
 * Cũng CHỈ GỢI Ý như bảng trên, không bao giờ tự áp.
 *
 * Cố ý BỎ QUA những tên trùng nhau giữa các tỉnh. Một gợi ý sai mà
 * nghe hợp lý còn nguy hơn không gợi ý gì: người xác nhận đang vội
 * sẽ bấm đồng ý.
 *
 * Tên nào đã là tỉnh hiện hành (Thanh Hóa, Cà Mau…) hoặc đã nằm
 * trong bảng tỉnh cũ (Nam Định, Hải Dương…) thì không lặp lại ở đây.
 */
export const THANH_PHO_TRONG_TINH: Record<string, TenTinh> = {
  // Khánh Hòa (gồm Ninh Thuận cũ)
  "nha trang": "Khánh Hòa",
  "cam ranh": "Khánh Hòa",
  "phan rang thap cham": "Khánh Hòa",
  "phan rang": "Khánh Hòa",

  // TP. Hồ Chí Minh (gồm Bình Dương và Bà Rịa - Vũng Tàu cũ)
  "thu duc": "TP. Hồ Chí Minh",
  "thu dau mot": "TP. Hồ Chí Minh",
  "di an": "TP. Hồ Chí Minh",
  "ba ria": "TP. Hồ Chí Minh",

  // Đồng Nai (gồm Bình Phước cũ)
  "bien hoa": "Đồng Nai",
  "long khanh": "Đồng Nai",
  "dong xoai": "Đồng Nai",

  // Lâm Đồng (gồm Bình Thuận và Đắk Nông cũ)
  "da lat": "Lâm Đồng",
  "bao loc": "Lâm Đồng",
  "phan thiet": "Lâm Đồng",
  "gia nghia": "Lâm Đồng",

  // Đắk Lắk (gồm Phú Yên cũ)
  "buon ma thuot": "Đắk Lắk",
  "tuy hoa": "Đắk Lắk",

  // Gia Lai (gồm Bình Định cũ)
  pleiku: "Gia Lai",
  "quy nhon": "Gia Lai",

  // Đà Nẵng (gồm Quảng Nam cũ)
  "tam ky": "Đà Nẵng",
  "hoi an": "Đà Nẵng",

  // Quảng Trị (gồm Quảng Bình cũ)
  "dong ha": "Quảng Trị",
  "dong hoi": "Quảng Trị",

  // Nghệ An, Thanh Hóa
  vinh: "Nghệ An",
  "cua lo": "Nghệ An",
  "sam son": "Thanh Hóa",

  // Ninh Bình (gồm Hà Nam và Nam Định cũ)
  "phu ly": "Ninh Bình",

  // Quảng Ninh
  "ha long": "Quảng Ninh",
  "cam pha": "Quảng Ninh",
  "mong cai": "Quảng Ninh",
  "uong bi": "Quảng Ninh",

  // Phú Thọ (gồm Vĩnh Phúc và Hòa Bình cũ)
  "viet tri": "Phú Thọ",
  "vinh yen": "Phú Thọ",
  "phuc yen": "Phú Thọ",

  // Bắc Ninh (gồm Bắc Giang cũ)
  "tu son": "Bắc Ninh",

  // Lào Cai, Điện Biên
  "sa pa": "Lào Cai",
  "dien bien phu": "Điện Biên",

  // An Giang (gồm Kiên Giang cũ)
  "long xuyen": "An Giang",
  "chau doc": "An Giang",
  "rach gia": "An Giang",
  "ha tien": "An Giang",

  // Đồng Tháp (gồm Tiền Giang cũ)
  "cao lanh": "Đồng Tháp",
  "sa dec": "Đồng Tháp",
  "my tho": "Đồng Tháp",
  "go cong": "Đồng Tháp",

  // Cần Thơ (gồm Hậu Giang cũ)
  "vi thanh": "Cần Thơ",
  "nga bay": "Cần Thơ",

  // Tây Ninh (gồm Long An cũ)
  "tan an": "Tây Ninh",
};

/**
 * Bỏ dấu, bỏ tiền tố hành chính, gom khoảng trắng.
 *
 * Mục đích là so khớp CHỨ KHÔNG phải để lưu: bản đã bỏ dấu không bao
 * giờ được ghi xuống database, vì hãng vận chuyển cần đúng tên có dấu
 * khớp danh mục của họ.
 */
export function chuanHoaDeSoKhop(s: string): string {
  return s
    .normalize("NFD")
    // Bỏ dấu thanh và dấu mũ
    .replace(/[̀-ͯ]/g, "")
    // đ/Đ không nằm trong dải tổ hợp nên phải xử lý riêng
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    // Gom khoảng trắng và cắt hai đầu TRƯỚC khi bỏ tiền tố: neo `^`
    // của biểu thức dưới không khớp nổi nếu chuỗi còn khoảng trắng
    // đứng đầu, và "  Thành phố   Hà Nội" là cách gõ rất thường gặp.
    .replace(/\s+/g, " ")
    .trim()
    // Bỏ tiền tố hành chính ở đầu chuỗi
    .replace(/^(tinh|thanh pho|tp|t p)\s+/, "");
}

/** Bảng tra dựng sẵn một lần, tránh quét 34 phần tử mỗi lần gọi. */
const TRA_NHANH: Map<string, TenTinh> = (() => {
  const m = new Map<string, TenTinh>();
  for (const t of TINH_THANH) {
    m.set(chuanHoaDeSoKhop(t), t);
  }
  for (const [viet, tinh] of Object.entries(CACH_VIET_KHAC)) {
    m.set(chuanHoaDeSoKhop(viet), tinh);
  }
  return m;
})();

/** Vì sao có gợi ý, để câu hỏi cho người dùng nói đúng chuyện. */
export type LoaiGoiY = "TINH_SAP_NHAP" | "CAP_DUOI_TINH";

export interface KetQuaTraTinh {
  /** Tên chuẩn để gửi cho hãng. NULL = không khớp chắc chắn. */
  tinh: TenTinh | null;
  /**
   * Tên tỉnh đề nghị, để hỏi lại người dùng.
   *
   * Có giá trị ở đây nghĩa là ĐỪNG tự lưu — hiện ra cho người xác
   * nhận rồi mới ghi.
   */
  goiY: TenTinh | null;
  /**
   * "TINH_SAP_NHAP": tên tỉnh cũ, nay thuộc tỉnh khác.
   * "CAP_DUOI_TINH": tên thành phố/thị xã, chưa bao giờ là tỉnh.
   *
   * Hai chuyện khác nhau nên lời nhắc cũng phải khác. Nói với người
   * gõ "Nha Trang" rằng tỉnh của họ đã sáp nhập là sai sự thật.
   */
  loaiGoiY: LoaiGoiY | null;
}

/**
 * Một tỉnh HIỆN HÀNH gồm những tỉnh CŨ nào.
 *
 * Chiều ngược của `TEN_CU_DA_SAP_NHAP`, và là thứ bắt buộc phải có
 * để dựng danh sách quận/huyện cho người chọn.
 *
 * Danh mục hãng vận chuyển vẫn theo 63 tỉnh cũ: GHN liệt kê 65 đơn
 * vị, trong đó "Bình Dương" là một tỉnh RIÊNG chứ không nằm trong
 * "Hồ Chí Minh". Nên hỏi GHN danh sách quận của TP. Hồ Chí Minh chỉ
 * được 25 quận, không có Thủ Dầu Một — người ở đó không chọn nổi
 * địa chỉ của mình.
 *
 * Trả về tên đã bỏ dấu để so khớp với danh mục của hãng, kèm chính
 * tỉnh đó (một tỉnh không sáp nhập thì chỉ có một phần tử).
 */
export function tinhCuCua(tinhMoi: TenTinh): string[] {
  const cu = Object.entries(TEN_CU_DA_SAP_NHAP)
    .filter(([, moi]) => moi === tinhMoi)
    .map(([khoa]) => khoa);
  return [chuanHoaDeSoKhop(tinhMoi), ...cu];
}

/** Tra một chuỗi bất kỳ về tên tỉnh chuẩn. */
export function traTinh(nhap: string): KetQuaTraTinh {
  const khoa = chuanHoaDeSoKhop(nhap);
  const khop = TRA_NHANH.get(khoa);
  if (khop) {
    return { tinh: khop, goiY: null, loaiGoiY: null };
  }

  const cu = TEN_CU_DA_SAP_NHAP[khoa];
  if (cu) {
    return { tinh: null, goiY: cu, loaiGoiY: "TINH_SAP_NHAP" };
  }

  // Tra bảng tỉnh cũ TRƯỚC: "Nam Định" vừa là tỉnh cũ vừa là tên
  // thành phố, và câu trả lời "tỉnh này đã sáp nhập" mới là thứ
  // người gõ cần nghe.
  const thanhPho = THANH_PHO_TRONG_TINH[khoa];
  if (thanhPho) {
    return { tinh: null, goiY: thanhPho, loaiGoiY: "CAP_DUOI_TINH" };
  }

  return { tinh: null, goiY: null, loaiGoiY: null };
}
