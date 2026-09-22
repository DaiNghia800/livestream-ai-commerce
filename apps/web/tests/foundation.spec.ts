import { test, expect, type Page } from "@playwright/test";

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("customer dialog supports Escape and restores keyboard focus", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/");
  await page.screenshot({ path: test.info().outputPath("customer.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const trigger = page.getByRole("button", { name: "Xem A001" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Đặt hàng — sắp có" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Đóng", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(consoleErrors).toEqual([]);
});
test("navigation and combined filters work without horizontal overflow", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Thử gửi bình luận" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Kênh chủ shop" }).click();
  await expect(
    page.getByRole("heading", { name: "Tổng quan hoạt động" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Tổng quan" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.screenshot({ path: test.info().outputPath("merchant.png"), fullPage: true });
  await page.getByLabel("Trạng thái", { exact: true }).selectOption("paid");
  await expect(page.getByText("ORD-8821", { exact: true })).toBeVisible();
  await expect(page.getByText("ORD-8820", { exact: true })).not.toBeVisible();
  await page.getByLabel("Tìm đơn hàng").fill("không tồn tại");
  await expect(
    page.getByRole("heading", { name: "Không tìm thấy đơn hàng" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test("merchant layout marks the livestream route active and exposes mobile navigation", async ({
  page,
}, testInfo) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/shop/livestream/live-2025-08");
  await expect(
    page.getByRole("heading", { name: "Đại tiệc Flash Sale BST Linen Hè 2025" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Livestream", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("button", { name: /Bắt đầu Live/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Chỉnh sửa phiên/ })).toBeDisabled();
  await page.screenshot({
    path: test.info().outputPath("merchant-live-detail.png"),
    fullPage: true,
  });

  if (testInfo.project.name === "mobile") {
    const menuButton = page.getByRole("button", { name: "Mở menu quản lý" });
    await expect(menuButton).toBeVisible();
    await menuButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Đóng menu quản lý" }).first(),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("navigation", { name: "Điều hướng chủ shop" })).toBeVisible();
  }

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(consoleErrors).toEqual([]);
});
