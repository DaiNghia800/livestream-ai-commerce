import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { PAYMENT_PAID, PAYMENT_UNDERPAID, stubApi } from "./fixtures/api";

async function activate(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name }).focus();
  await page.keyboard.press("Enter");
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

  await activate(page, /^Bộ lọc/);
  await activate(page, "Giá trị cho Trạng thái");
  await page.getByRole("option", { name: "Đã thanh toán" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByText(PAYMENT_PAID.txnRef, { exact: true })).toBeVisible();
  // exact: true để không dính nhãn sr-only của link thao tác.
  await expect(
    page.getByText(PAYMENT_UNDERPAID.txnRef, { exact: true }),
  ).toHaveCount(0);

  await activate(page, /^Bộ lọc/);
  await activate(page, "Đặt lại");
  await page.keyboard.press("Escape");
  // Cột thao tác nằm cuối bảng rộng; kích hoạt bằng bàn phím xác nhận
  // link vẫn dùng được cả khi bảng đang cuộn ngang trên điện thoại.
  const link = page.getByRole("link", {
    name: `Xem chi tiết giao dịch ${PAYMENT_PAID.txnRef}`,
  });
  await link.focus();
  await page.keyboard.press("Enter");

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

test("lọc kết hợp, sắp xếp và phân trang khoản thu", async ({ page }) => {
  const payments = Array.from({ length: 25 }, (_, index) => ({
    ...PAYMENT_PAID,
    id: `pay-${index}`,
    txnRef: `TXN-${String(index).padStart(2, "0")}`,
    amount: String(100000 + index * 1000),
    paidAmount: String(100000 + index * 1000),
  }));
  await stubApi(page, { payments });
  await page.goto("/shop/payments");

  await expect(page.locator("tbody tr")).toHaveCount(20);
  await activate(page, "Trang sau");
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await page.getByLabel("Số dòng mỗi trang").selectOption("10");
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(page.getByText(/Hiện 1–10 trong/)).toBeVisible();

  await activate(page, "Sắp xếp danh sách");
  await page.getByRole("menuitem", { name: "Phải thu cao → thấp" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("tbody tr").first()).toContainText("TXN-24");

  await activate(page, /^Bộ lọc/);
  await activate(page, "Giá trị cho Hình thức");
  await page.getByRole("option", { name: "Thu hộ khi giao (COD)" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Không có khoản thu khớp" })).toBeVisible();
  await activate(page, /^Bộ lọc/);
  await activate(page, "Đặt lại");
  await expect(page.locator("tbody tr")).toHaveCount(10);
});

test("xuất Excel khoản thu giữ bộ lọc, số tiền và độ rộng cột", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/payments");
  await page.getByLabel("Tìm giao dịch").fill(PAYMENT_UNDERPAID.txnRef);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    activate(page, /Xuất Excel/),
  ]);
  expect(download.suggestedFilename()).toMatch(/^thanh-toan-\d{8}-\d{4}\.xlsx$/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await download.path())!);
  const sheet = workbook.worksheets[0];
  expect(sheet.rowCount).toBe(2);
  expect(sheet.getRow(2).getCell(1).value).toBe(PAYMENT_UNDERPAID.txnRef);
  expect(sheet.getRow(2).getCell(7).value).toBe(398000);
  expect(sheet.getRow(2).getCell(8).value).toBe(100000);
  expect(sheet.getColumn(1).width).toBeGreaterThan(PAYMENT_UNDERPAID.txnRef.length);
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

test("recording a manual refund requires explicit confirmation", async ({ page }) => {
  await stubApi(page);
  await page.goto(`/shop/payments/${PAYMENT_PAID.txnRef}`);
  await page.getByRole("button", { name: "Ghi nhận đã hoàn bên ngoài" }).click();
  const confirm = page.getByRole("button", { name: "Xác nhận đã hoàn" });
  await expect(confirm).toBeDisabled();
  await page.getByRole("checkbox", { name: "Tôi đã kiểm tra giao dịch hoàn tiền thành công" }).check();
  await expect(confirm).toBeEnabled();
  await page.getByRole("button", { name: "Quay lại" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
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
