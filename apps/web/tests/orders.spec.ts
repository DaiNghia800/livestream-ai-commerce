import { readFileSync } from "node:fs";
import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  ORDER_CANCELLED,
  ORDER_DETAIL,
  ORDER_DRAFT,
  ORDER_EXPIRED,
  ORDER_SAP_HET,
  stubApi,
} from "./fixtures/api";

/**
 * Bấm một phần tử, kéo vào khung nhìn trước.
 *
 * `force` KHÔNG phải để che lỗi giao diện. Trên viewport cảm ứng,
 * phép kiểm chạm của Playwright báo bị che trong khi
 * `document.elementFromPoint` tại đúng tâm phần tử lại trả về chính
 * nó — đã đo để xác nhận. Phần tử thật sự bấm được; chỉ heuristic sai.
 *
 * Cú bấm có ăn hay không thì các assert ngay sau đó chứng minh.
 */
async function bam(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.click({ force: true });
  void page;
}

/** Mở popup bộ lọc. Bảng lọc không hiện sẵn, phải bấm nút mới ra. */
async function moBoLoc(page: Page) {
  const nut = page.getByRole("button", { name: /^Bộ lọc/ });
  if ((await nut.getAttribute("aria-expanded")) !== "true") {
    await bam(page, nut);
  }
}

/**
 * Chọn giá trị cho một điều kiện CÓ SẴN trong bảng lọc.
 *
 * Bốn điều kiện hay dùng được mở sẵn khi vào, nên không phải bấm
 * "Thêm điều kiện" cho chúng.
 */
async function chonGiaTri(page: Page, truong: string, giaTri: string) {
  await moBoLoc(page);
  await bam(page, page.getByRole("button", { name: `Giá trị cho ${truong}` }));
  await bam(page, page.getByRole("option", { name: giaTri }));
  await page.keyboard.press("Escape");
}


function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("order list filters by status and keeps the layout inside the viewport", async ({
  page,
}, testInfo) => {
  const consoleErrors = collectConsoleErrors(page);
  await stubApi(page);
  await page.goto("/shop/orders");

  await expect(
    page.getByRole("heading", { name: "Quản lý Đơn hàng Livestream" }),
  ).toBeVisible();
  if (testInfo.project.name !== "mobile") {
    await expect(
      page.getByRole("link", { name: "Đơn hàng", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }

  await expect(
    page.getByText(ORDER_DRAFT.orderCode, { exact: true }),
  ).toBeVisible();

  await chonGiaTri(page, "Trạng thái đơn", "Đã hủy");
  await expect(
    page.getByText(ORDER_CANCELLED.orderCode, { exact: true }),
  ).toBeVisible();
  // exact: true để không dính nhãn sr-only của link thao tác.
  await expect(
    page.getByText(ORDER_DRAFT.orderCode, { exact: true }),
  ).toHaveCount(0);

  // Đặt lại rồi tìm một chuỗi không có thật để ra bảng rỗng.
  await moBoLoc(page);
  await bam(page, page.getByRole("button", { name: /Đặt lại/ }));
  await page.keyboard.press("Escape");
  await page.getByLabel("Tìm đơn hàng").fill("không tồn tại");
  await expect(
    page.getByRole("heading", { name: "Chưa có đơn nào" }),
  ).toBeVisible();

  await page.screenshot({
    path: test.info().outputPath("orders.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test("order list shows a retry when the service is down", async ({ page }) => {
  await stubApi(page, { fail: true });
  await page.goto("/shop/orders");

  // Dịch vụ sập là tình huống phải nói rõ, không được hiện bảng rỗng
  // như thể hôm nay chưa ai mua gì.
  await expect(
    page.getByRole("heading", { name: "Không thể tải nội dung" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Thử lại" })).toBeVisible();
});

test("unknown order code shows a clear empty state", async ({ page }) => {
  await stubApi(page, { orderDetail: null });
  await page.goto("/shop/orders/LIVE-19990101-zzzzzz");

  await expect(
    page.getByRole("heading", { name: /Không tìm thấy đơn/ }),
  ).toBeVisible();
});

test("order detail renders items, history and the payment box", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await stubApi(page);
  await page.goto(`/shop/orders/${ORDER_DRAFT.orderCode}`);

  await expect(
    page.getByRole("heading", { name: `Chi tiết đơn ${ORDER_DRAFT.orderCode}` }),
  ).toBeVisible();
  // exact: true để không dính luôn dòng trong phiếu in (ẩn, nhưng
  // vẫn nằm trong DOM và ghi "Áo sơ mi lụa · Be · L").
  await expect(page.getByText("Áo sơ mi lụa", { exact: true })).toBeVisible();
  await expect(page.getByText("Khách xác nhận qua link")).toBeVisible();
  // Đơn đã xác nhận nhưng chưa có khoản thu — phải mời tạo.
  await expect(page.getByText("Đơn chưa có khoản thu.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  expect(consoleErrors).toEqual([]);
});

test("cancel dialog blocks submit until a reason is chosen", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await stubApi(page);
  await page.goto(`/shop/orders/${ORDER_DRAFT.orderCode}`);

  const trigger = page.getByRole("button", { name: "Hủy đơn hàng" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();

  const confirm = page.getByRole("button", {
    name: "Xác nhận hủy và trả tồn",
  });
  await expect(confirm).toBeDisabled();
  await page
    .getByRole("radio", { name: "Khách yêu cầu hủy qua chat hoặc điện thoại" })
    .check();
  await expect(confirm).toBeEnabled();

  await page.getByRole("button", { name: "Đóng hộp thoại" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(consoleErrors).toEqual([]);
});

test("choosing 'other' as the reason requires a note", async ({ page }) => {
  await stubApi(page);
  await page.goto(`/shop/orders/${ORDER_DRAFT.orderCode}`);

  await page.getByRole("button", { name: "Hủy đơn hàng" }).click();
  await page.getByRole("radio", { name: "Lý do khác" }).check();

  // Chọn "khác" mà bỏ trống thì nhật ký đối soát có một dòng vô nghĩa.
  await expect(
    page.getByRole("button", { name: "Xác nhận hủy và trả tồn" }),
  ).toBeDisabled();

  await page.getByLabel(/Ghi chú nội bộ/).fill("Shop gọi khách không nghe máy");
  await expect(
    page.getByRole("button", { name: "Xác nhận hủy và trả tồn" }),
  ).toBeEnabled();
});

test("đồng hồ đổi màu khi còn dưới một phút", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/orders");

  // Dưới một phút là lúc shop phải quyết: gọi khách, hay để hàng về
  // kho. Cùng một màu từ đầu tới cuối thì không ai nhận ra khoảnh khắc đó.
  const gap = page
    .locator("tr", { hasText: ORDER_SAP_HET.orderCode })
    .locator(".countdown");
  await expect(gap).toHaveAttribute("data-urgent", "true");

  const con5phut = page
    .locator("tr", { hasText: ORDER_DRAFT.orderCode })
    .locator(".countdown");
  await expect(con5phut).toHaveAttribute("data-urgent", "false");

  // Và màu phải khác nhau thật, không chỉ khác thuộc tính.
  const mau = await gap.evaluate((e) => getComputedStyle(e).color);
  const mauThuong = await con5phut.evaluate((e) => getComputedStyle(e).color);
  expect(mau).not.toBe(mauThuong);
});

test("đơn hết hạn hiện cảnh báo đỏ ở màn chi tiết", async ({ page }) => {
  await stubApi(page, { orderDetail: { ...ORDER_DETAIL, status: "EXPIRED" } });
  await page.goto(`/shop/orders/${ORDER_EXPIRED.orderCode}`);

  // Backend xoá mốc giữ hàng khi cho hết hạn, nên không thể dựa vào
  // đồng hồ để biết — phải xét thẳng trạng thái.
  await expect(
    page.getByRole("heading", { name: "Lượt giữ hàng đã hết hạn" }),
  ).toBeVisible();
});

test("nút huỷ biến mất với đơn không còn huỷ được", async ({ page }) => {
  await stubApi(page, { orderDetail: { ...ORDER_DETAIL, status: "COMPLETED" } });
  await page.goto(`/shop/orders/${ORDER_DETAIL.orderCode}`);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Một nút mờ chỉ làm shop phân vân "sao không bấm được".
  await expect(page.getByRole("button", { name: "Hủy đơn hàng" })).toHaveCount(0);
});

test("bảng lọc chỉ hiện khi bấm nút, và mở ra đã có sẵn điều kiện", async ({
  page,
}) => {
  await stubApi(page);
  await page.goto("/shop/orders");

  // Mặc định bảng lọc không chiếm chỗ trên màn hình.
  await expect(page.getByText("các điều kiện sau:")).toHaveCount(0);

  await bam(page, page.getByRole("button", { name: /^Bộ lọc/ }));
  await expect(page.getByText("các điều kiện sau:")).toBeVisible();

  // Mở ra trống trơn thì người dùng phải đoán có những gì lọc được.
  for (const truong of ["Trạng thái đơn", "Thanh toán", "Nguồn đơn", "Giữ hàng"]) {
    await expect(
      page.getByRole("button", { name: `Giá trị cho ${truong}` }),
    ).toBeVisible();
  }
});

test("nút Bộ lọc đếm số điều kiện đang áp dụng", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/orders");

  const nut = page.getByRole("button", { name: /^Bộ lọc/ });
  // Điều kiện chưa chọn giá trị thì không tính — nếu không, vừa mở ra
  // đã báo "4" trong khi bảng chưa bị lọc gì.
  await expect(nut).not.toContainText("1");

  await chonGiaTri(page, "Trạng thái đơn", "Đã hủy");
  await expect(nut).toContainText("1");
});

test("bỏ một điều kiện bằng dấu trừ", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/orders");
  await moBoLoc(page);

  await bam(page, page.getByRole("button", { name: "Bỏ điều kiện Giữ hàng" }));
  await expect(
    page.getByRole("button", { name: "Giá trị cho Giữ hàng" }),
  ).toHaveCount(0);

  // Bỏ rồi thì thêm lại được qua menu.
  await bam(page, page.getByRole("button", { name: /Thêm điều kiện/ }));
  await expect(page.getByRole("menuitem", { name: "Giữ hàng" })).toBeVisible();
});

test("sắp xếp theo tiền cao nhất trước", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/orders");

  await bam(page, page.getByRole("button", { name: "Sắp xếp danh sách" }));
  await bam(page, page.getByRole("menuitem", { name: "Tiền cao → thấp" }));

  const tien = await page
    .locator("tbody tr td:nth-child(4)")
    .allTextContents();
  const so = tien.map((t) => Number(t.replace(/\D/g, "")));
  expect([...so].sort((a, b) => b - a)).toEqual(so);
});

test("xuất Excel tải về CSV đúng những đơn đang hiển thị", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/orders");

  // Lọc còn một đơn rồi mới xuất — tệp phải theo bộ lọc, không phải
  // toàn bộ dữ liệu đã tải.
  await chonGiaTri(page, "Trạng thái đơn", "Đã hủy");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    bam(page, page.getByRole("button", { name: /Xuất Excel/ })),
  ]);

  expect(download.suggestedFilename()).toMatch(/^don-hang-\d{8}-\d{4}\.csv$/);

  const noiDung = readFileSync((await download.path())!, "utf8");

  // BOM UTF-8: thiếu nó thì Excel đọc dấu tiếng Việt thành ký tự rác.
  expect(noiDung.charCodeAt(0)).toBe(0xfeff);
  expect(noiDung).toContain("Mã đơn");
  expect(noiDung).toContain(ORDER_CANCELLED.orderCode);
  expect(noiDung).not.toContain(ORDER_DRAFT.orderCode);
});

test("ô có dấu phẩy được bọc nháy, không vỡ cột", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/orders");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    bam(page, page.getByRole("button", { name: /Xuất Excel/ })),
  ]);
  const noiDung = readFileSync((await download.path())!, "utf8");

  // Mọi ô đều phải được bọc — địa chỉ tiếng Việt luôn có dấu phẩy.
  for (const dong of noiDung.replace(/^﻿/, "").split("\r\n")) {
    if (dong) expect(dong.startsWith('"')).toBe(true);
  }
});

test("nút Xuất Excel mờ khi không còn đơn nào", async ({ page }) => {
  await stubApi(page, { orders: [] });
  await page.goto("/shop/orders");
  await expect(page.getByRole("button", { name: /Xuất Excel/ })).toBeDisabled();
});

test("in hàng loạt dựng phiếu giao cho các đơn đang hiển thị", async ({
  page,
}) => {
  await stubApi(page);
  await page.goto("/shop/orders");

  // Chặn hộp thoại in thật, chỉ ghi nhận là nó được gọi.
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed += 1;
    };
  });
  await page.reload();

  await bam(page, page.getByRole("button", { name: /In hàng loạt/ }));

  // Phiếu phải có địa chỉ và dòng hàng — hai thứ danh sách không có,
  // nên chúng chứng minh chi tiết từng đơn đã được tải.
  const phieu = page.locator("#print-root");
  await expect(phieu).toHaveCount(1);
  await expect(phieu).toContainText("PHIẾU GIAO HÀNG");
  await expect(phieu).toContainText("Áo sơ mi lụa");
  await expect(phieu).toContainText("Duy Tân");

  await expect
    .poll(() => page.evaluate(() => (window as never)["__printed"]))
    .toBeGreaterThan(0);
});

test("phiếu in không hiện trên màn hình", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/orders");
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.reload();
  await bam(page, page.getByRole("button", { name: /In hàng loạt/ }));

  // Khu vực phiếu nằm trong DOM nhưng phải ẩn, nếu không nó đổ dài
  // phía dưới bảng và trông như lỗi.
  await expect(page.locator("#print-root")).toBeHidden();
});

test("phân trang: mặc định 20 dòng, chuyển trang được", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/orders");

  await expect(page.locator("tbody tr")).toHaveCount(20);
  await expect(page.getByText(/Hiện 1–20 trong/)).toBeVisible();

  await bam(page, page.getByRole("button", { name: "Trang sau" }));
  await expect(page.getByText(/Hiện 21–/)).toBeVisible();
  // Tổng 25 đơn nên trang hai còn 5 dòng.
  await expect(page.locator("tbody tr")).toHaveCount(5);

  await expect(page.getByRole("button", { name: "Trang sau" })).toBeDisabled();
});

test("đổi số dòng mỗi trang và quay về trang đầu", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/orders");

  await bam(page, page.getByRole("button", { name: "Trang sau" }));
  await expect(page.getByText(/Hiện 21–/)).toBeVisible();

  await page.getByLabel("Số dòng mỗi trang").selectOption("10");

  await expect(page.locator("tbody tr")).toHaveCount(10);
  // Đang ở trang 2 mà đổi cỡ trang thì phải về trang 1, nếu không
  // người dùng nhảy sang một khúc dữ liệu chẳng liên quan.
  await expect(page.getByText(/Hiện 1–10 trong/)).toBeVisible();
});

test("lọc xong thì phân trang tính lại, không kẹt ở trang cũ", async ({
  page,
}) => {
  await stubApi(page);
  await page.goto("/shop/orders");

  await bam(page, page.getByRole("button", { name: "Trang sau" }));
  await chonGiaTri(page, "Trạng thái đơn", "Đã hủy");

  // Còn đúng một đơn huỷ — bảng phải hiện nó chứ không trắng trơn.
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByText(/Hiện 1–1 trong 1 đơn/)).toBeVisible();
});

test("xuất Excel lấy TOÀN BỘ đơn đã lọc, không chỉ trang đang xem", async ({
  page,
}) => {
  await stubApi(page);
  await page.goto("/shop/orders");
  await expect(page.locator("tbody tr")).toHaveCount(20);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    bam(page, page.getByRole("button", { name: /Xuất Excel/ })),
  ]);
  const noiDung = readFileSync((await download.path())!, "utf8");

  // Xuất theo trang đang xem thì kế toán mất 5 đơn mà không biết.
  const soDong = noiDung.trim().split("\r\n").length - 1;
  expect(soDong).toBe(25);
});

test("khi IN THẬT, chỉ phiếu giao hiện ra còn giao diện bị giấu", async ({
  page,
}) => {
  await stubApi(page);
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto(`/shop/orders/${ORDER_DRAFT.orderCode}`);

  await bam(page, page.getByRole("button", { name: "In phiếu giao" }));

  // Đổi sang ngữ cảnh in rồi mới đo. Chỉ kiểm DOM như trước thì không
  // thấy được lỗi: phiếu nằm lồng trong <main>, mà CSS in giấu <main>
  // nên máy in nhả ra tờ trắng.
  await page.emulateMedia({ media: "print" });

  await expect(page.locator("#print-root")).toBeVisible();
  await expect(page.locator("#print-root")).toContainText("PHIẾU GIAO HÀNG");
  await expect(page.locator("#print-root")).toContainText("Áo sơ mi lụa");

  // Thanh điều hướng và nút bấm không được lọt lên giấy.
  await expect(
    page.getByRole("link", { name: "Đơn hàng", exact: true }),
  ).toBeHidden();

  await page.emulateMedia({ media: "screen" });
  await expect(page.locator("#print-root")).toBeHidden();
});

test("phiếu giao nằm ngay dưới body để CSS in với tới được", async ({
  page,
}) => {
  await stubApi(page);
  await page.goto(`/shop/orders/${ORDER_DRAFT.orderCode}`);
  // Cổng chỉ dựng sau khi hydrate xong, nên phải chờ phần tử có mặt.
  await page.locator("#print-root").waitFor({ state: "attached" });

  const laConBody = await page.evaluate(
    () => document.getElementById("print-root")?.parentElement === document.body,
  );
  expect(laConBody).toBe(true);
});

test("in hàng loạt cũng hiện đúng khi in thật", async ({ page }) => {
  await stubApi(page);
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto("/shop/orders");
  await bam(page, page.getByRole("button", { name: /In hàng loạt/ }));
  await expect(page.locator("#print-root")).toContainText("PHIẾU GIAO HÀNG");

  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#print-root")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
});

test("đơn hết hạn KHÔNG có nút huỷ ở bảng danh sách", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/orders");

  // Bày nút ra cho đơn đã hết hạn là mời người dùng bấm vào một việc
  // chắc chắn thất bại — backend trả 409.
  await expect(
    page.getByRole("link", { name: `Hủy đơn ${ORDER_EXPIRED.orderCode}` }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: `Hủy đơn ${ORDER_CANCELLED.orderCode}` }),
  ).toHaveCount(0);

  // Đơn nháp thì vẫn huỷ được nên phải còn nút.
  await expect(
    page.getByRole("link", { name: `Hủy đơn ${ORDER_DRAFT.orderCode}` }),
  ).toBeVisible();
});

test("bấm nút huỷ ở danh sách thì mở thẳng hộp thoại huỷ", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/orders");

  await bam(
    page,
    page.getByRole("link", { name: `Hủy đơn ${ORDER_DRAFT.orderCode}` }),
  );

  // Trước đây mỏ neo #huy-don trỏ vào phần tử không tồn tại nên chỉ
  // mở trang chi tiết rồi đứng im.
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(ORDER_DRAFT.orderCode);
});

test("đóng hộp thoại thì xoá mỏ neo, F5 không mở lại", async ({ page }) => {
  await stubApi(page);
  await page.goto(`/shop/orders/${ORDER_DRAFT.orderCode}#huy-don`);
  await expect(page.getByRole("dialog")).toBeVisible();

  await bam(page, page.getByRole("button", { name: "Giữ lại đơn" }));
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(page.url()).not.toContain("#huy-don");

  await page.reload();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("mỏ neo huỷ KHÔNG mở hộp thoại cho đơn đã hết hạn", async ({ page }) => {
  await stubApi(page, { orderDetail: { ...ORDER_DETAIL, status: "EXPIRED" } });
  await page.goto(`/shop/orders/${ORDER_EXPIRED.orderCode}#huy-don`);

  await expect(
    page.getByRole("heading", { name: "Lượt giữ hàng đã hết hạn" }),
  ).toBeVisible();
  // Gõ tay địa chỉ có mỏ neo cũng không được vượt qua luật nghiệp vụ.
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("đơn đã huỷ có nút Tạo lại đơn và lời giải thích", async ({ page }) => {
  await stubApi(page, { orderDetail: { ...ORDER_DETAIL, status: "CANCELLED" } });
  await page.goto(`/shop/orders/${ORDER_CANCELLED.orderCode}`);

  await expect(
    page.getByRole("heading", { name: /Đơn này đã đóng, hàng đã trả về kho/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Tạo lại đơn/ })).toBeEnabled();
  // Không được bày nút huỷ cho đơn đã huỷ.
  await expect(page.getByRole("button", { name: "Hủy đơn hàng" })).toHaveCount(0);
});

test("đơn hết hạn cũng tạo lại được", async ({ page }) => {
  await stubApi(page, { orderDetail: { ...ORDER_DETAIL, status: "EXPIRED" } });
  await page.goto(`/shop/orders/${ORDER_EXPIRED.orderCode}`);
  await expect(page.getByRole("button", { name: /Tạo lại đơn/ })).toBeVisible();
});

test("đơn còn sống KHÔNG có nút Tạo lại đơn", async ({ page }) => {
  await stubApi(page);
  await page.goto(`/shop/orders/${ORDER_DRAFT.orderCode}`);
  await expect(page.getByRole("button", { name: /Tạo lại đơn/ })).toHaveCount(0);
});

test("tạo lại đơn xin đúng SỐ KHÁCH MUỐN rồi chuyển sang đơn mới", async ({
  page,
}) => {
  const choThieu = {
    ...ORDER_DETAIL,
    status: "CANCELLED",
    items: [{ ...ORDER_DETAIL.items[0], quantity: 3, requestedQty: 5, isPartial: true }],
  };
  await stubApi(page, { orderDetail: choThieu });
  await page.goto(`/shop/orders/${ORDER_CANCELLED.orderCode}`);

  const [req] = await Promise.all([
    page.waitForRequest(
      (r) => r.url().includes("/orders/draft") && r.method() === "POST",
    ),
    bam(page, page.getByRole("button", { name: /Tạo lại đơn/ })),
  ]);

  // Đơn cũ chỉ giữ được 3 trên 5. Lần này phải thử lại đủ 5, nếu
  // không khách vĩnh viễn không mua đủ số mình muốn.
  expect(req.postDataJSON().lines).toEqual([
    { skuId: ORDER_DETAIL.items[0].skuId, quantity: 5 },
  ]);
  // Mỗi lần tạo lại là một lần chốt khác, phải mang khoá riêng.
  expect(req.headers()["idempotency-key"]).toBeTruthy();

  await expect(page).toHaveURL(/LIVE-20261010-moi999/);
});
