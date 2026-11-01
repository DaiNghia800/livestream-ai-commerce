import { test, expect, type Page } from "@playwright/test";

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text();
      if (!text.includes("net::ERR_CONNECTION_REFUSED")) {
        errors.push(text);
      }
    }
  });
  return errors;
}

test.beforeEach(async ({ page }, testInfo) => {
  if (!testInfo.title.includes("guest user")) {
    await page.addInitScript(() => {
      localStorage.setItem(
        "auth_user",
        JSON.stringify({
          full_name: "Minh Hằng",
          email: "minhhang.live@gmail.com",
        })
      );
    });
  }
});

test("customer livestream page renders header, player, pinned product and chat", async ({
  page,
}, testInfo) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/");

  // 1. Verify Header
  await expect(page.getByText("LiveOrder AI").first()).toBeVisible();
  if (testInfo.project.name !== "mobile") {
    await expect(page.getByText("Thời Trang Hè ChicStyle Official").first()).toBeVisible();
    await expect(page.getByText("Độ trễ thấp")).toBeVisible();
  }

  // 2. Verify Video Player & Overlays
  await expect(page.getByText("TRỰC TIẾP", { exact: true })).toBeVisible();
  await expect(page.getByText(/2[.,]845/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Thời Trang Hè ChicStyle Official" })).toBeVisible();

  // 3. Verify Pinned Product Card (#1)
  await expect(page.getByText("Đang ghim").first()).toBeVisible();
  await expect(page.getByText("Mã: A001").first()).toBeVisible();
  await expect(page.getByText("199.000").first()).toBeVisible();

  // 4. Test Syntax Injection
  const syntaxBtn = page.getByRole("button", { name: "A001", exact: true });
  await syntaxBtn.click();

  const commentInput = page.getByPlaceholder(/Nhập bình luận hoặc cú pháp mua/);
  await expect(commentInput).toHaveValue(/A001.*x1/);

  // 5. Send Comment and Verify AI Order Detection Card
  await page.getByRole("button", { name: "Thử gửi bình luận" }).click();
  await expect(commentInput).toHaveValue("");

  // Verify AI Detection Card appears
  await expect(page.getByText("Hệ thống AI Gemini đã ghi nhận:")).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByText("ĐÃ GIỮ CHỖ")).toBeVisible();
  await expect(page.getByText(/Điền địa chỉ nhận hàng|Xác nhận địa chỉ/)).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("customer product detail modal opens and closes properly", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/");

  // Click on product detail button
  const detailBtn = page.getByRole("button", { name: "Xem A001" });
  await detailBtn.click();

  // Dialog visible
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByText("Mã sản phẩm: A001")).toBeVisible();
  await expect(page.getByRole("button", { name: "Đặt hàng ngay" })).toBeVisible();

  // Click Chốt ngay from dialog to fill chat
  await page.getByRole("button", { name: /Chốt ngay A001/ }).click();
  await expect(dialog).not.toBeVisible();

  const commentInput = page.getByPlaceholder(/Nhập bình luận hoặc cú pháp mua/);
  await expect(commentInput).toHaveValue(/A001.*x1/);

  expect(consoleErrors).toEqual([]);
});

test("customer livestream UX improvements (urgency, countdown, viewing indicators, like effects)", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/");

  // 1. Verify Urgency & Stock indicators (#2)
  await expect(page.getByText(/Còn \d+ cái/).first()).toBeVisible();
  const ctaBtn = page.getByRole("button", { name: "Đặt Mua Ngay" });
  await expect(ctaBtn).toBeVisible();

  // 2. Verify Viewing counts (#6)
  await expect(page.getByText(/đang xem/).first()).toBeVisible();

  // 3. Verify Like button and Floating Hearts trigger (#8)
  const likeBtn = page.getByRole("button", { name: "Thả tim cho livestream" });
  await expect(likeBtn).toBeVisible();
  await likeBtn.click();
  // Animation element rendered
  const floatingHeart = page.locator(".animate-float-heart").first();
  await expect(floatingHeart).toBeAttached();

  // 4. Test AI Detection Countdown Timer (#4)
  const syntaxBtn = page.getByRole("button", { name: "A001", exact: true });
  await syntaxBtn.click();
  await page.getByRole("button", { name: "Thử gửi bình luận" }).click();

  // Verify reservation countdown progress bar
  await expect(page.getByText("Thời gian giữ chỗ còn lại")).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("customer mobile sticky product bar displays and functions on small screen", async ({
  page,
}) => {
  // Set viewport to mobile
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");

  // Sticky product bar should be visible on mobile (#3)
  const buyNowBtn = page.getByRole("button", { name: "Mua Ngay", exact: true });
  await expect(buyNowBtn).toBeVisible();

  // Click Mua Ngay fills chat input (#9)
  await buyNowBtn.click();
  const commentInput = page.getByPlaceholder(/Nhập bình luận hoặc cú pháp mua/);
  await expect(commentInput).toHaveValue("A001 x1");
});

test("floating in-video pinned product card allows instant purchase without scrolling", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/");

  // 1. Verify Floating Pinned Card is visible directly on the video player
  const inVideoBuyBtn = page.getByRole("button", { name: /Chốt.*A001/ });
  await expect(inVideoBuyBtn).toBeVisible();
  await expect(page.getByText("#A001").first()).toBeVisible();

  // 2. Click "Chốt A001" directly on the video card (Zero-Scroll Shopping)
  await inVideoBuyBtn.click();

  // 3. Verify chat input is filled instantly
  const commentInput = page.getByPlaceholder(/Nhập bình luận hoặc cú pháp mua/);
  await expect(commentInput).toHaveValue("A001 x1");

  // 4. Test minimize & expand toggle
  const minimizeBtn = page.getByRole("button", { name: "Thu nhỏ thẻ sản phẩm" });
  await minimizeBtn.click();

  // Minimized badge pill appears
  await expect(inVideoBuyBtn).not.toBeVisible();
  const expandBtn = page.getByRole("button", { name: "Mở rộng sản phẩm đang ghim" });
  await expect(expandBtn).toBeVisible();

  // Click to expand again
  await expandBtn.click();
  await expect(inVideoBuyBtn).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("tiktok-style horizontal product carousel displays multiple products and supports quick syntax fill", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/");

  // 1. Verify Catalog Carousel Header & Count
  await expect(page.getByText("Các sản phẩm khác trong giỏ hàng")).toBeVisible();
  await expect(page.getByText("8 mặt hàng")).toBeVisible();

  // 2. Verify Carousel Items exist
  await expect(page.getByText("DM02").first()).toBeVisible();
  await expect(page.getByText("QJ02").first()).toBeVisible();
  await expect(page.getByText("PL03").first()).toBeVisible();

  // 3. Click quick fill "+ PL03" from the carousel
  const fillBtn = page.getByRole("button", { name: "Điền cú pháp PL03" });
  await expect(fillBtn).toBeVisible();
  await fillBtn.click();

  // 4. Verify chat input has "PL03 x1"
  const commentInput = page.getByPlaceholder(/Nhập bình luận hoặc cú pháp mua/);
  await expect(commentInput).toHaveValue("PL03 x1");

  expect(consoleErrors).toEqual([]);
});

test("in-live quick order modal dialog opens cleanly without horizontal overflow or duplicate buttons", async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/");

  // 1. Click "Đặt mua" or "Đặt Mua Ngay"
  const quickBuyBtn = page.getByRole("button", { name: /Đặt Mua/i }).first();
  await expect(quickBuyBtn).toBeVisible();
  await quickBuyBtn.click();

  // 2. Dialog appears with concise title "Đặt hàng nhanh"
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "Đặt hàng nhanh" })).toBeVisible();

  // 3. Verify no duplicate "Đóng" button exists in the quick order dialog (only "Hủy" and "Xác nhận đặt hàng")
  await expect(dialog.getByRole("button", { name: "Đóng", exact: true })).not.toBeVisible();
  await expect(dialog.getByRole("button", { name: "Hủy" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Xác nhận đặt hàng/ })).toBeVisible();

  // 4. Verify size selection is available and functional
  await expect(dialog.getByText(/Kích thước \(Size\)/)).toBeVisible();
  const sizeMBtn = dialog.getByRole("button", { name: "M", exact: true });
  await expect(sizeMBtn).toBeVisible();
  await sizeMBtn.click();
  await expect(dialog.getByText("Size M", { exact: true })).toBeVisible();

  // 5. Verify input fields work cleanly without overlapping icons
  const nameInput = dialog.locator("#quick-order-name");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("Nguyễn Văn A");
  await expect(nameInput).toHaveValue("Nguyễn Văn A");

  // 6. Verify checkbox is compact and properly sized
  const flashSaleCheckbox = page.locator('input[type="checkbox"]').first();
  await expect(flashSaleCheckbox).toBeVisible();
  const boxBounds = await flashSaleCheckbox.boundingBox();
  expect(boxBounds).not.toBeNull();
  if (boxBounds) {
    // Checkbox should be around 16px to 20px, not giant 40-50px
    expect(boxBounds.width).toBeLessThanOrEqual(24);
    expect(boxBounds.height).toBeLessThanOrEqual(24);
  }

  // 7. Verify no horizontal overflow in dialog (scrollWidth should equal clientWidth)
  const isOverflowingHorizontally = await dialog.evaluate((el) => {
    return el.scrollWidth > el.clientWidth;
  });
  expect(isOverflowingHorizontally).toBe(false);

  // 8. Test closing via "Hủy" button
  await page.getByRole("button", { name: "Hủy" }).click();
  await expect(dialog).not.toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("shopee/tiktok rule: guest user must log in with 1-touch Google to comment and order", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  // 1. Check chat shows requirement for guest
  await expect(page.getByText("Bắt buộc đăng nhập trước khi bình luận")).toBeVisible();
  const commentInput = page.getByPlaceholder(/Vui lòng đăng nhập để bình luận/);
  await expect(commentInput).toBeVisible();

  // 2. Click input -> Opens Google 1-Touch Login Dialog
  await commentInput.click();
  const authDialog = page.getByRole("dialog");
  await expect(authDialog).toBeVisible();
  await expect(page.getByText("Đăng nhập để chốt đơn & bình luận")).toBeVisible();
  await expect(authDialog.getByRole("button", { name: "Đăng nhập Google" })).toBeVisible();

  // 3. Click 1-touch Google button
  await page.getByText("Tiếp tục bằng tài khoản Google").click();
  await expect(authDialog).not.toBeVisible();

  // 4. Chat is unlocked
  await expect(page.getByPlaceholder(/Nhập bình luận hoặc cú pháp mua/)).toBeVisible();
  if (testInfo.project.name !== "mobile") {
    await expect(page.getByText("Minh Hằng").first()).toBeVisible();
  }
});

test("customer can add products to personal cart and checkout multi-item order", async ({
  page,
}) => {
  await page.goto("/");

  // 1. Check Header Cart starts with 0 or empty badge
  const headerCartBtn = page.getByLabel("Giỏ hàng cá nhân");
  await expect(headerCartBtn).toBeVisible();

  // 2. Click "Thêm vào giỏ" on hero pinned product
  const addToCartBtn = page.getByRole("button", { name: "Thêm vào giỏ", exact: true }).first();
  await expect(addToCartBtn).toBeVisible();
  await addToCartBtn.click();

  // Toast notification appears
  await expect(page.getByText(/Đã thêm .* vào giỏ hàng cá nhân!/)).toBeVisible();

  // 3. Header Cart Count badge increments to 1
  await expect(headerCartBtn).toContainText("1");

  // 4. Click Header Cart button -> Opens CustomerPersonalCartDialog
  await headerCartBtn.click();
  await expect(page.getByText(/Giỏ hàng của bạn \(1 món\)/)).toBeVisible();
  await expect(page.getByText(/Ưu đãi độc quyền trên Livestream/)).toBeVisible();

  // 5. Test increment quantity in personal cart
  const plusBtn = page.getByRole("button", { name: "Tăng số lượng" }).first();
  await plusBtn.click();
  await expect(page.getByText(/Giỏ hàng của bạn \(2 món\)/)).toBeVisible();

  // 6. Click "Mua hàng" for selected items
  const checkoutBtn = page.getByRole("button", { name: /Mua hàng/ });
  await checkoutBtn.click();

  // Multi-item cart checkout dialog opens
  await expect(page.getByText(/Thanh toán giỏ hàng \(2 món\)/)).toBeVisible();

  // Fill recipient info
  await page.fill("#cart-order-name", "Trần Thị Mai");
  await page.fill("#cart-order-phone", "0988776655");
  await page.fill("#cart-order-address", "789 Đường Lê Lợi, Quận 1, TP.HCM");

  // Submit cart order
  await page.getByRole("button", { name: /Xác nhận đặt/ }).click();

  // Verify Order Success modal appears
  await expect(page.getByRole("heading", { name: "Đặt hàng thành công", exact: true })).toBeVisible();
  await expect(page.getByText(/Đơn hàng gộp 2 sản phẩm/)).toBeVisible();
});

