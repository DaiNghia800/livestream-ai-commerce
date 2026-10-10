import { test, expect, type Page } from "@playwright/test";
import { PAYMENT_PAID, PAYMENT_UNDERPAID, stubApi } from "./fixtures/api";

/**
 * Bấm một chip lọc.
 *
 * `force` ở đây KHÔNG phải để che lỗi giao diện. Trên viewport cảm
 * ứng, phép kiểm chạm của Playwright báo nhãn "Nguồn đơn" chắn mất
 * chip, trong khi `document.elementFromPoint` tại đúng tâm chip trả
 * về chính chip đó và nhãn nằm cách 80px phía trên. Phần tử thật sự
 * bấm được; chỉ heuristic là sai.
 *
 * Cú bấm có ăn hay không thì các assert ngay sau đó chứng minh: danh
 * sách phải đổi theo bộ lọc.
 */
async function clickChip(page: Page, name: RegExp) {
  const chip = page.getByRole("button", { name });
  await chip.scrollIntoViewIfNeeded();
  await chip.click({ force: true });
}

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("payment list links through to the transaction detail", async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  await stubApi(page);
  await page.goto("/shop/payments");

  await expect(
    page.getByRole("heading", { name: "Đối soát thu tiền" }),
  ).toBeVisible();

  // Hàng chip cuộn ngang trên mobile nên phải kéo vào khung
  // trước khi bấm, nếu không Playwright chờ mãi vì phần tử nằm
  // ngoài vùng nhìn thấy.
  await clickChip(page, /^Đã thanh toán/);
  await expect(page.getByText(PAYMENT_PAID.txnRef, { exact: true })).toBeVisible();
  // exact: true để không dính nhãn sr-only của link thao tác.
  await expect(
    page.getByText(PAYMENT_UNDERPAID.txnRef, { exact: true }),
  ).toHaveCount(0);

  await clickChip(page, /^Tất cả/);
  // Tên khả truy cập của link giờ đã kèm mã giao dịch nên trỏ thẳng
  // được, không phải đi vòng qua dòng bảng.
  //
  // Cột thao tác nằm cuối một bảng rộng, trên màn hình hẹp nó phải
  // cuộn ngang trong `.table-wrap` mới thấy. Kéo vào khung trước rồi
  // mới bấm, cùng lý do như clickChip.
  const link = page.getByRole("link", {
    name: `Xem chi tiết giao dịch ${PAYMENT_PAID.txnRef}`,
  });
  await link.scrollIntoViewIfNeeded();
  await link.click({ force: true });

  await expect(
    page.getByRole("heading", { name: `Giao dịch ${PAYMENT_PAID.txnRef}` }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

  await page.screenshot({
    path: test.info().outputPath("payment-detail.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test("underpaid transfers are called out, not buried", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/payments");

  // Khách chuyển thiếu là tình huống phải có người xử lý. Để nó lẫn
  // vào danh sách thì shop giao hàng mà chưa đủ tiền.
  await expect(
    page.getByRole("heading", { name: /khoản thu đang lệch số tiền/ }),
  ).toBeVisible();
  await expect(
    page.locator("tr", { hasText: PAYMENT_UNDERPAID.txnRef }),
  ).toContainText("Khách chuyển thiếu");
});

test("transaction detail lists every incoming transfer", async ({ page }) => {
  await stubApi(page);
  await page.goto(`/shop/payments/${PAYMENT_UNDERPAID.txnRef}`);

  await expect(
    page.getByRole("heading", { name: /Khách chuyển thiếu/ }),
  ).toBeVisible();
  // Mỗi lần tiền về là một dòng riêng — đó là lý do mô hình tách bảng.
  await expect(page.getByRole("heading", { name: /Từng lần tiền về/ })).toBeVisible();
  await expect(page.getByText("FT99")).toBeVisible();
});

test("the gateway picker only offers sandbox providers", async ({ page }) => {
  await stubApi(page);
  await page.goto(`/shop/payments/${PAYMENT_UNDERPAID.txnRef}`);

  await expect(page.getByText(/môi trường thử/i).first()).toBeVisible();
  const picker = page.getByLabel("Chọn cổng");
  await expect(picker).toBeVisible();
  for (const label of ["VNPay (sandbox)", "MoMo (môi trường thử)", "ZaloPay (sandbox)"]) {
    await expect(picker.getByRole("option", { name: label })).toHaveCount(1);
  }
});

test("payment list shows a retry when the service is down", async ({ page }) => {
  await stubApi(page, { fail: true });
  await page.goto("/shop/payments");
  await expect(
    page.getByRole("heading", { name: "Không thể tải nội dung" }),
  ).toBeVisible();
});

test("ô Đã thu cộng cả khoản khách mới trả một phần", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/payments");

  // Lọc theo status === "PAID" sẽ bỏ sót khoản chuyển một nửa — tiền
  // đó đã nằm trong tài khoản shop rồi.
  const tong =
    Number(PAYMENT_PAID.paidAmount) + Number(PAYMENT_UNDERPAID.paidAmount);
  const o = page.locator(".metric-grid > *", { hasText: "Đã thu" });
  await expect(o).toContainText(tong.toLocaleString("vi-VN"));
});
