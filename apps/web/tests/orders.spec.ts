import { test, expect, type Page } from "@playwright/test";

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
  await page.goto("/shop/orders");
  await expect(
    page.getByRole("heading", { name: "Đơn hàng từ phiên livestream" }),
  ).toBeVisible();
  if (testInfo.project.name !== "mobile") {
    await expect(
      page.getByRole("link", { name: "Đơn hàng", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }

  await page.getByRole("button", { name: /^Đã hủy/ }).click();
  await expect(page.getByText("ORD-9937", { exact: true })).toBeVisible();
  await expect(page.getByText("ORD-9942", { exact: true })).not.toBeVisible();

  await page.getByRole("button", { name: /^Tất cả/ }).click();
  await page.getByLabel("Tìm đơn hàng").fill("không tồn tại");
  await expect(
    page.getByRole("heading", { name: "Không tìm thấy đơn hàng" }),
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

test("unknown order code renders the not-found page", async ({ page }) => {
  await page.goto("/shop/orders/ord-0000");
  await expect(page.getByText(/404|không tìm thấy/i).first()).toBeVisible();
});

test("cancel dialog blocks submit until a reason is chosen", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/shop/orders/ord-9942");
  await expect(
    page.getByRole("heading", { name: "Chi tiết đơn ORD-9942" }),
  ).toBeVisible();

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
