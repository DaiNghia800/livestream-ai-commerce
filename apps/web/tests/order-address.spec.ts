import { test, expect } from "@playwright/test";
import { ORDER_DETAIL, ORDER_DIA_CHI_HONG, stubApi } from "./fixtures/api";

/**
 * Sửa tay địa chỉ giao.
 *
 * Trước khi có màn này, cảnh báo "địa chỉ chưa chuẩn hoá" là một ngõ
 * cụt: nó bảo shop đi kiểm tra lại tỉnh và phường, nhưng không có
 * chỗ nào sửa được, mà đơn thì không đẩy sang hãng được.
 *
 * Thứ được giữ ở đây là LỐI RA phải tồn tại và dẫn tới đâu đó, cùng
 * với việc tỉnh phải chọn từ danh mục chứ không gõ tay.
 */

const DUONG_DAN = `/shop/orders/${ORDER_DIA_CHI_HONG.orderCode}`;

test.describe("Sửa địa chỉ giao", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page, { orderDetail: ORDER_DIA_CHI_HONG });
  });

  test("địa chỉ chưa chuẩn hoá thì cảnh báo kèm LỐI RA, không phải ngõ cụt", async ({
    page,
  }) => {
    await page.goto(DUONG_DAN);

    await expect(
      page.getByRole("heading", { name: /chưa chuẩn hoá/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sửa địa chỉ giao" }),
    ).toBeVisible();
  });

  test("hộp thoại hiện lại nguyên văn khách đã gõ để đối chiếu", async ({
    page,
  }) => {
    await page.goto(DUONG_DAN);
    await page.getByRole("button", { name: "Sửa địa chỉ giao" }).click();

    // Người sửa cần nhìn thấy bản gốc, chứ không phải nhớ lại.
    // Khoanh vào hộp thoại: cùng dòng địa chỉ còn hiện ở thẻ đơn và
    // bản in phía sau.
    await expect(
      page.getByRole("dialog").getByText(ORDER_DIA_CHI_HONG.shippingAddress),
    ).toBeVisible();
  });

  test("tỉnh là danh sách CHỌN, không cho gõ tay", async ({ page }) => {
    // Gõ tay là sai chính tả rồi hỏng ở bước tạo vận đơn — muộn hơn
    // và khó hiểu hơn nhiều.
    await page.goto(DUONG_DAN);
    await page.getByRole("button", { name: "Sửa địa chỉ giao" }).click();

    const tinh = page.getByLabel("Tỉnh / Thành phố");
    await expect(tinh).toBeVisible();
    await expect(tinh.locator("option")).toContainText(["Khánh Hòa"]);
  });

  test("chưa điền đủ thì nút Lưu vẫn khoá", async ({ page }) => {
    await page.goto(DUONG_DAN);
    await page.getByRole("button", { name: "Sửa địa chỉ giao" }).click();

    const luu = page.getByRole("button", { name: "Lưu địa chỉ" });
    await expect(luu).toBeDisabled();

    await page.getByLabel("Tỉnh / Thành phố").selectOption("Khánh Hòa");
    await expect(luu).toBeDisabled();

    await page
      .getByLabel("Quận / Huyện")
      .selectOption("Thành phố Nha Trang");
    await page.getByLabel("Phường / Xã").selectOption("Phường Lộc Thọ");
    await expect(luu).toBeDisabled();

    await page.getByLabel("Số nhà, tên đường").fill("88 Trần Phú");
    await expect(luu).toBeEnabled();
  });

  test("chọn tỉnh xong mới ra quận, chọn quận xong mới ra phường", async ({
    page,
  }) => {
    // Danh mục hãng vẫn ba cấp. Cho gõ tay phường mà không có quận
    // là đúng cái sinh ra lỗi "ward not found" của GHN.
    await page.goto(DUONG_DAN);
    await page.getByRole("button", { name: "Sửa địa chỉ giao" }).click();

    const huyen = page.getByLabel("Quận / Huyện");
    await expect(huyen).toBeDisabled();

    await page.getByLabel("Tỉnh / Thành phố").selectOption("Khánh Hòa");
    await expect(huyen.locator("option")).toContainText([
      "Thành phố Nha Trang",
    ]);

    await huyen.selectOption("Thành phố Nha Trang");
    await expect(page.getByLabel("Phường / Xã").locator("option")).toContainText(
      ["Phường Lộc Thọ"],
    );
  });

  test("đổi quận thì xoá phường đã chọn, không để lại cặp sai", async ({
    page,
  }) => {
    // Giữ lại "Phường Lộc Thọ" sau khi đổi sang Cam Ranh là tạo ra
    // một địa chỉ không tồn tại, mà nhìn thì vẫn hợp lệ.
    await page.goto(DUONG_DAN);
    await page.getByRole("button", { name: "Sửa địa chỉ giao" }).click();

    await page.getByLabel("Tỉnh / Thành phố").selectOption("Khánh Hòa");
    const huyen = page.getByLabel("Quận / Huyện");
    await huyen.selectOption("Thành phố Nha Trang");
    await page.getByLabel("Phường / Xã").selectOption("Phường Lộc Thọ");

    await huyen.selectOption("Thành phố Cam Ranh");
    await expect(page.getByLabel("Phường / Xã")).toHaveValue("");
  });

  test("hãng chưa khai khoá thì lùi về ô gõ tay, không chặn người dùng", async ({
    page,
  }) => {
    // Danh mục rỗng = chưa khai khoá hãng hoặc hãng hỏng. Khoá người
    // dùng lại chỉ vì thiếu một khoá API là phản ứng quá tay.
    await page.goto(DUONG_DAN);
    await page.getByRole("button", { name: "Sửa địa chỉ giao" }).click();

    // "Đà Nẵng" không có trong danh mục giả nên trả mảng rỗng.
    await page.getByLabel("Tỉnh / Thành phố").selectOption("Đà Nẵng");
    await page.getByLabel("Quận / Huyện").fill("Quận Hải Châu");
    await page.getByLabel("Phường / Xã").fill("Phường Thạch Thang");
    await page.getByLabel("Số nhà, tên đường").fill("1 Bạch Đằng");

    await expect(
      page.getByRole("button", { name: "Lưu địa chỉ" }),
    ).toBeEnabled();
  });

  test("lưu xong gửi đúng trường riêng lẻ, không gửi một dòng gộp", async ({
    page,
  }) => {
    await page.goto(DUONG_DAN);
    await page.getByRole("button", { name: "Sửa địa chỉ giao" }).click();

    await page.getByLabel("Tỉnh / Thành phố").selectOption("Khánh Hòa");
    await page
      .getByLabel("Quận / Huyện")
      .selectOption("Thành phố Nha Trang");
    await page.getByLabel("Phường / Xã").selectOption("Phường Lộc Thọ");
    await page.getByLabel("Số nhà, tên đường").fill("88 Trần Phú");

    const [yeuCau] = await Promise.all([
      page.waitForRequest(
        (r) => r.url().includes("/address") && r.method() === "POST",
      ),
      page.getByRole("button", { name: "Lưu địa chỉ" }).click(),
    ]);

    expect(yeuCau.postDataJSON()).toMatchObject({
      provinceName: "Khánh Hòa",
      wardName: "Phường Lộc Thọ",
      streetLine: "88 Trần Phú",
      // Gửi KÈM quận/huyện: danh mục hãng vẫn ba cấp, thiếu cấp giữa
      // là họ không tra ra phường.
      districtName: "Thành phố Nha Trang",
    });
  });

  test("backend từ chối thì hiện NGUYÊN VĂN lý do", async ({ page }) => {
    // Khi tỉnh sai, câu backend trả về kèm luôn gợi ý tên đúng. Rút
    // gọn lại là mất đúng phần giúp được shop.
    await page.goto(DUONG_DAN);
    await page.getByRole("button", { name: "Sửa địa chỉ giao" }).click();

    await page.getByLabel("Tỉnh / Thành phố").selectOption("Hà Nội");
    await page.getByLabel("Phường / Xã").fill("Phường Dịch Vọng");
    await page.getByLabel("Số nhà, tên đường").fill("18 Duy Tân");
    await page.getByRole("button", { name: "Lưu địa chỉ" }).click();

    // Lọc theo chữ: Next còn một role=alert rỗng cho bộ đọc màn hình.
    await expect(
      page.getByRole("alert").filter({ hasText: /không nhận giao tuyến này/ }),
    ).toBeVisible();
  });

  test("địa chỉ đã chuẩn hoá thì KHÔNG hiện cảnh báo lẫn nút sửa", async ({
    page,
  }) => {
    await stubApi(page, { orderDetail: ORDER_DETAIL });
    await page.goto(`/shop/orders/${ORDER_DETAIL.orderCode}`);

    // Chờ một thứ CÓ thật hiện ra trước, nếu không phép kiểm "không
    // hiện" sẽ đạt chỉ vì trang chưa kịp dựng.
    await expect(
      page.getByRole("heading", { name: new RegExp(ORDER_DETAIL.orderCode) }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Sửa địa chỉ giao" }),
    ).toBeHidden();
  });
});
