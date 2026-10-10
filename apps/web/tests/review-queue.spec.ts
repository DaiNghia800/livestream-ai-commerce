import { test, expect, type Page } from "@playwright/test";
import { REVIEW_REQUEST, stubApi } from "./fixtures/api";

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("review queue shows the original comment and why it was held back", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await stubApi(page);
  await page.goto("/shop/review-queue");

  await expect(
    page.getByRole("heading", { name: "Bình luận cần người xác nhận" }),
  ).toBeVisible();

  // Nhân viên cần thấy câu gốc để phán, và lý do để không duyệt bừa.
  await expect(page.getByText(/cho e 2 cái áo xanh size M/)).toBeVisible();
  await expect(page.getByText("Số lượng bất thường")).toBeVisible();
  await expect(page.getByText(/AI chắc 70%/)).toBeVisible();

  // Khách muốn 5 nhưng chỉ giữ được 2 — phải nói rõ.
  await expect(page.getByText(/khách muốn 5/)).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test("approve and reject buttons are both reachable", async ({ page }) => {
  await stubApi(page);
  await page.goto("/shop/review-queue");

  await expect(page.getByRole("button", { name: /Duyệt thành đơn/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Không phải đơn/ })).toBeEnabled();
});

test("empty queue says so instead of showing a blank card", async ({ page }) => {
  await stubApi(page, { reviewQueue: [] });
  await page.goto("/shop/review-queue");

  await expect(
    page.getByRole("heading", { name: "Hàng đợi trống" }),
  ).toBeVisible();
});

test("a failing service shows the error state", async ({ page }) => {
  await stubApi(page, { fail: true });
  await page.goto("/shop/review-queue");
  await expect(
    page.getByRole("heading", { name: "Không thể tải nội dung" }),
  ).toBeVisible();
});

test("review queue is reachable from the sidebar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Thanh bên bị ẩn trên mobile");
  await stubApi(page);
  await page.goto("/shop/orders");

  await page.getByRole("link", { name: "Hàng đợi duyệt" }).click();
  await expect(
    page.getByRole("heading", { name: "Bình luận cần người xác nhận" }),
  ).toBeVisible();
  void REVIEW_REQUEST;
});
