/**
 * Chuẩn hoá địa chỉ — chỗ dễ làm hàng đi lạc tỉnh nhất.
 *
 * Ca test ở đây chia làm hai nhóm, và nhóm thứ hai mới là nhóm quan
 * trọng:
 *
 *   1. Tách đúng những địa chỉ viết chuẩn.
 *   2. KHÔNG đoán bừa những địa chỉ viết thiếu hoặc viết theo tên cũ.
 *
 * Nhóm 2 là thứ bảo vệ khách hàng thật: một dòng đoán sai trong bảng
 * tên tỉnh cũ là kiện hàng đi nhầm tỉnh, mà cả người gõ lẫn người
 * giao đều thấy địa chỉ hợp lệ.
 */

import { describe, expect, it } from "vitest";
import {
  moTaLyDo,
  tachDiaChi,
} from "../../../src/modules/shipping/address/normalize-address.js";
import {
  TINH_THANH,
  chuanHoaDeSoKhop,
  traTinh,
} from "../../../src/modules/shipping/address/vietnam-provinces.js";

describe("Danh mục tỉnh/thành", () => {
  it("đúng 34 đơn vị sau sáp nhập", () => {
    expect(TINH_THANH).toHaveLength(34);
    expect(new Set(TINH_THANH).size).toBe(34);
  });

  it("bỏ dấu và bỏ tiền tố hành chính khi so khớp", () => {
    expect(chuanHoaDeSoKhop("TP. Hồ Chí Minh")).toBe("ho chi minh");
    expect(chuanHoaDeSoKhop("Tỉnh Đắk Lắk")).toBe("dak lak");
    expect(chuanHoaDeSoKhop("  Thành phố   Hà Nội ")).toBe("ha noi");
  });

  it("nhận mọi cách khách hay gõ cho cùng một tỉnh", () => {
    for (const viet of ["TPHCM", "tp hcm", "Sài Gòn", "Hồ Chí Minh", "sg"]) {
      expect(traTinh(viet).tinh).toBe("TP. Hồ Chí Minh");
    }
    expect(traTinh("hn").tinh).toBe("Hà Nội");
    expect(traTinh("Thừa Thiên Huế").tinh).toBe("Huế");
  });

  it("tên tỉnh đã sáp nhập CHỈ được gợi ý, không tự áp", () => {
    const kq = traTinh("Bình Dương");
    // Không tự đổi: đây là ranh giới giữa gợi ý và quyết định thay
    // người dùng.
    expect(kq.tinh).toBeNull();
    expect(kq.goiY).toBe("TP. Hồ Chí Minh");

    expect(traTinh("Hải Dương").goiY).toBe("Hải Phòng");
    expect(traTinh("Quảng Nam").goiY).toBe("Đà Nẵng");
  });

  it("tên hoàn toàn lạ thì không khớp và cũng không gợi ý", () => {
    expect(traTinh("Tỉnh Không Có Thật")).toEqual({ tinh: null, goiY: null });
  });
});

describe("Tách địa chỉ hai cấp (sau sáp nhập)", () => {
  it("tách đủ ba phần và nhận ra là địa chỉ kiểu mới", () => {
    const kq = tachDiaChi(
      "128/4 Nguyễn Thị Minh Khai, Phường Bến Thành, TP. Hồ Chí Minh"
    );
    expect(kq.daChuanHoa).toBe(true);
    expect(kq.provinceName).toBe("TP. Hồ Chí Minh");
    expect(kq.wardName).toBe("Phường Bến Thành");
    expect(kq.streetLine).toBe("128/4 Nguyễn Thị Minh Khai");
    expect(kq.districtName).toBeNull();
    expect(kq.isNewFormat).toBe(true);
  });

  it("nhận cả xã và thị trấn, không chỉ phường", () => {
    expect(tachDiaChi("12 Đường Lớn, Xã Tân Phú, Đồng Nai").wardName).toBe(
      "Xã Tân Phú"
    );
    expect(
      tachDiaChi("5 Ngõ Nhỏ, Thị trấn Chúc Sơn, Hà Nội").wardName
    ).toBe("Thị trấn Chúc Sơn");
  });

  it("bỏ qua phần 'Việt Nam' thừa ở cuối", () => {
    const kq = tachDiaChi(
      "1 Lê Duẩn, Phường Bến Nghé, TP. Hồ Chí Minh, Việt Nam"
    );
    expect(kq.provinceName).toBe("TP. Hồ Chí Minh");
    expect(kq.daChuanHoa).toBe(true);
  });
});

describe("Tách địa chỉ ba cấp (kiểu cũ)", () => {
  it("giữ nguyên quận/huyện và đánh dấu là kiểu cũ", () => {
    const kq = tachDiaChi(
      "128/4 Nguyễn Thị Minh Khai, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh"
    );
    expect(kq.daChuanHoa).toBe(true);
    expect(kq.districtName).toBe("Quận 1");
    // Cờ này quyết định payload gửi hãng có kèm huyện hay không
    expect(kq.isNewFormat).toBe(false);
    expect(kq.streetLine).toBe("128/4 Nguyễn Thị Minh Khai");
  });

  it("nhận cả huyện và thị xã", () => {
    expect(
      tachDiaChi("1 Đường A, Xã B, Huyện Củ Chi, TP. Hồ Chí Minh").districtName
    ).toBe("Huyện Củ Chi");
    expect(
      tachDiaChi("1 Đường A, Phường B, Thị xã Dĩ An, TP. Hồ Chí Minh")
        .districtName
    ).toBe("Thị xã Dĩ An");
  });
});

describe("Không đoán bừa khi địa chỉ thiếu", () => {
  it("thiếu phường/xã thì báo rõ, không tự bịa", () => {
    const kq = tachDiaChi("128/4 Nguyễn Thị Minh Khai, TP. Hồ Chí Minh");
    expect(kq.daChuanHoa).toBe(false);
    expect(kq.lyDo).toContain("THIEU_PHUONG_XA");
    expect(kq.wardName).toBe("");
  });

  it("không có tỉnh thì báo thiếu", () => {
    const kq = tachDiaChi("128/4 Nguyễn Thị Minh Khai");
    expect(kq.daChuanHoa).toBe(false);
    expect(kq.lyDo).toContain("THIEU_TINH");
  });

  it("tỉnh lạ thì nói là lạ, khác với nói là thiếu", () => {
    const kq = tachDiaChi("1 Đường A, Phường B, Tỉnh Bịa Đặt");
    expect(kq.lyDo).toContain("TINH_LA");
  });

  it("tỉnh đã sáp nhập thì CHƯA chuẩn, kèm gợi ý tên mới", () => {
    const kq = tachDiaChi("12 Lê Lợi, Phường Phú Hòa, Bình Dương");
    // Có đủ thông tin nhưng vẫn không tự lưu — chờ người xác nhận
    expect(kq.daChuanHoa).toBe(false);
    expect(kq.lyDo).toContain("TINH_DA_SAP_NHAP");
    expect(kq.goiYTinh).toBe("TP. Hồ Chí Minh");
    expect(kq.wardName).toBe("Phường Phú Hòa");
  });

  it("chỉ có mỗi tên phường và tỉnh thì thiếu số nhà", () => {
    const kq = tachDiaChi("Phường Bến Thành, TP. Hồ Chí Minh");
    expect(kq.daChuanHoa).toBe(false);
    expect(kq.lyDo).toContain("THIEU_SO_NHA");
  });

  it("chuỗi rỗng không làm nổ", () => {
    const kq = tachDiaChi("");
    expect(kq.daChuanHoa).toBe(false);
    expect(kq.lyDo.length).toBeGreaterThan(0);
  });

  it("gộp được nhiều lý do thành một câu đọc được", () => {
    const kq = tachDiaChi("abc");
    const cau = moTaLyDo(kq.lyDo);
    expect(cau).toContain("tỉnh/thành");
    expect(cau.length).toBeGreaterThan(10);
  });
});
