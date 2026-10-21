import { test, expect } from "@playwright/test";
import { SHIP_DETAIL, stubApi } from "./fixtures/api";

/**
 * Khối thông tin bưu kiện và bảng giả lập hãng.
 *
 * Hai thứ này sinh ra từ cùng một vấn đề: muốn biết chuyện gì đang
 * xảy ra với kiện hàng thì shop phải mở portal của hãng. Thông tin
 * đóng gói, cước, người gửi, người nhận — ta đã có đủ trong database
 * mà không hiện ra.
 *
 * Còn bảng giả lập tồn tại vì sandbox của hãng KHÔNG tự chạy: GHN
 * chỉ cấp cho token shop hai lệnh đổi trạng thái, và một trong hai
 * báo thành công mà không đổi gì. Không có nó thì vận đơn thử nằm ở
 * "chờ lấy hàng" vĩnh viễn.
 */

const DUONG_DAN = `/shop/shipping/${SHIP_DETAIL.id}`;

test.describe("Chi tiết vận đơn — thông tin bưu kiện", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("hiện cả nơi gửi lẫn nơi nhận, kèm số điện thoại", async ({ page }) => {
    // "Hàng đi từ đâu" là câu shop phải trả lời ngay khi bưu tá báo
    // không tìm thấy điểm lấy.
    await page.goto(DUONG_DAN);

    const khoi = page.getByText("Thông tin bưu kiện").locator("..");
    await expect(khoi).toContainText("Kho LiveOrder");
    await expect(khoi).toContainText("0900000000");
    await expect(khoi).toContainText("Nguyễn Thuỳ Trang");
    await expect(khoi).toContainText("18 Duy Tân");
  });

  test("hiện thông số đóng gói và cước, không bắt mở portal hãng", async ({
    page,
  }) => {
    await page.goto(DUONG_DAN);

    const khoi = page.getByText("Thông tin bưu kiện").locator("..");
    await expect(khoi).toContainText("28×20×5 cm");
    await expect(khoi).toContainText("500 g");
    await expect(khoi).toContainText("23/10 - 24/10");
    // Mã SKU và số lượng: đủ để đối chiếu khi hãng báo thiếu hàng.
    await expect(khoi).toContainText("AO01-BE-L × 2");
  });

  test("lời dặn bưu tá hiện nguyên văn", async ({ page }) => {
    // Khi khách khiếu nại "bưu tá không cho xem hàng", đây đúng là
    // thứ cần tra.
    await page.goto(DUONG_DAN);
    await expect(page.getByText("Cho xem hàng không cho thử")).toBeVisible();
  });
});

test.describe("Chi tiết vận đơn — thanh tiến trình", () => {
  test("hiện năm chặng và đánh dấu chặng đang ở", async ({ page }) => {
    // Dòng thời gian kể đủ chuyện nhưng phải đọc. Thanh này trả lời
    // trong một cái liếc: hàng đang ở đoạn nào.
    await stubApi(page);
    await page.goto(DUONG_DAN);

    const thanh = page.getByRole("list", { name: "Tiến trình giao hàng" });
    await expect(thanh).toBeVisible();
    await expect(thanh.getByRole("listitem")).toHaveCount(5);
    await expect(thanh.locator("svg")).toHaveCount(5);
    // SHIP_DETAIL đang ở CREATED = chặng đầu.
    await expect(thanh.locator('[aria-current="step"]')).toContainText(
      "Tạo đơn",
    );
    await expect(thanh.getByRole("listitem", { name: "Giao xong: chưa tới" })).toBeVisible();
  });

  test("giao thành công thì cả năm chặng đều hoàn tất", async ({ page }) => {
    await stubApi(page, {
      shipmentDetail: { ...SHIP_DETAIL, status: "DELIVERED" },
    });
    await page.goto(DUONG_DAN);

    const thanh = page.getByRole("list", { name: "Tiến trình giao hàng" });
    await expect(thanh.getByRole("listitem", { name: /hoàn tất$/ })).toHaveCount(5);
    await expect(thanh.locator('[aria-current="step"]')).toHaveCount(0);
    await expect(thanh.locator("svg")).toHaveCount(5);
  });

  test("đơn hoàn về thì GIẤU thanh, không ép vào đường thuận", async ({
    page,
  }) => {
    // Vẽ một đơn đã hoàn về trên thanh "đang giao → giao xong" là
    // nói dối ngay chỗ dễ nhìn nhất.
    await stubApi(page, {
      shipmentDetail: { ...SHIP_DETAIL, status: "RETURNED" },
    });
    await page.goto(DUONG_DAN);

    await expect(page.getByText("Thông tin bưu kiện")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Tiến trình giao hàng" }),
    ).toBeHidden();
  });
});

test.describe("Chi tiết vận đơn — giả lập hãng", () => {
  test("bảng giả lập hiện đúng các mốc hãng có", async ({ page }) => {
    await stubApi(page);
    await page.goto(DUONG_DAN);

    await expect(page.getByText(/Giả lập hãng/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Đã lấy hàng/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Giao thành công/ }),
    ).toBeVisible();
  });

  test("bấm một mốc thì gửi đúng MÃ CỦA HÃNG, không phải trạng thái của ta", async ({
    page,
  }) => {
    // Gửi mã hãng để gói tin dựng ra giống hệt gói tin thật, và để
    // bảng ánh xạ trạng thái cũng được kiểm luôn — gửi trạng thái
    // nội bộ là bỏ qua đúng phần hay sai nhất.
    await stubApi(page);
    await page.goto(DUONG_DAN);

    const [yeuCau] = await Promise.all([
      page.waitForRequest(
        (r) => r.url().includes("/simulate") && r.method() === "POST",
      ),
      page.getByRole("button", { name: /Đã lấy hàng/ }).click(),
    ]);

    expect(yeuCau.postDataJSON()).toEqual({ code: "picked" });
  });

  test("KHÔNG có mốc nào thì giấu hẳn bảng, không hiện bảng rỗng", async ({
    page,
  }) => {
    // Danh sách rỗng nghĩa là đang chạy production, hoặc hãng không
    // nhận webhook. Hiện một bảng không bấm được gì chỉ làm người
    // dùng tưởng hệ thống hỏng.
    await stubApi(page, {
      shipmentDetail: { ...SHIP_DETAIL, moPhong: [] },
    });
    await page.goto(DUONG_DAN);

    // Chờ một thứ CÓ thật hiện ra trước, nếu không phép kiểm "không
    // hiện" sẽ đạt chỉ vì trang chưa kịp dựng.
    await expect(page.getByText("Thông tin bưu kiện")).toBeVisible();
    await expect(page.getByText(/Giả lập hãng/)).toBeHidden();
  });
});
