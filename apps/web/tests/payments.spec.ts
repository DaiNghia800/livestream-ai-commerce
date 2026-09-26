import { test, expect, type Page } from "@playwright/test";

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("payment list links through to the transaction detail", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/shop/payments");
  await expect(
    page.getByRole("heading", { name: "Thanh toán trong phiên" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Thất bại/ }).click();
  await expect(
    page.getByText("VNP-20250620-664811", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Tất cả/ }).click();
  await page
    .getByRole("row", { name: /VNP-20250620-889412/ })
    .getByRole("link", { name: "Chi tiết" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Giao dịch VNP-20250620-889412" }),
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
