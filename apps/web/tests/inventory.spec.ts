import { test, expect } from "@playwright/test";

test("inventory dashboard renders and filters stock rows", async ({
  page,
}, testInfo) => {
  await page.goto("/shop/inventory");

  await expect(
    page.getByRole("heading", {
      name: "Quản lý Tồn kho & Giữ chỗ Livestream",
    }),
  ).toBeVisible();
  if (testInfo.project.name !== "mobile") {
    await expect(
      page.getByLabel("Trạng thái kết nối IVS và Gemini"),
    ).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Đồng bộ kho WMS" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cảm biến và thiết bị" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thông báo hệ thống" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Chốt đơn ngay" })).toHaveAttribute(
    "href",
    "/shop/orders",
  );
  await expect(page.getByText("14,850")).toBeVisible();
  await expect(page.getByText("342 sản phẩm", { exact: true })).toBeVisible();
  await expect(page.getByText("14,508")).toBeVisible();
  await expect(page.getByText("8 SKU báo động", { exact: true })).toBeVisible();

  for (const label of [
    "Đang giữ chỗ Live",
    "Tồn khả dụng",
    "Cảnh báo sắp hết hàng",
  ]) {
    const labelElement = page.locator(`span[title="${label}"]`);
    await expect(labelElement).toBeVisible();
    await expect(labelElement).toHaveAttribute("title", label);
    expect(
      await labelElement.evaluate((element) => {
        const parent = element.parentElement;
        return parent ? getComputedStyle(parent).flexWrap : null;
      }),
    ).toBe("nowrap");
    expect(
      await labelElement.evaluate((element) => getComputedStyle(element).textOverflow),
    ).toBe("ellipsis");
  }

  const alertDescription = page.locator(
    'span[title="Cần nhập bổ sung gấp < 10 cái"]',
  );
  const reservedDescription = page.locator(
    'span[title="Tự động khóa bởi AI chốt đơn phiên #05"] > span',
  );
  const availableDescription = page.locator(
    'span[title="Sẵn sàng bán trên Live & Web"] > span',
  );
  for (const description of [
    alertDescription,
    reservedDescription,
    availableDescription,
  ]) {
    expect(
      await description.evaluate((element) => {
        const style = getComputedStyle(element);
        return `${style.whiteSpace}:${style.textOverflow}`;
      }),
    ).toBe("nowrap:ellipsis");
  }

  if (testInfo.project.name !== "mobile") {
    await expect(
      page.getByRole("link", { name: "Tồn kho", exact: true }),
    ).toBeVisible();
  }

  await expect(
    page.getByText("Áo sơ mi Linen Cổ Tàu Form Rộng"),
  ).toBeVisible();
  await expect(
    page.getByText("Quần Jean Ống Suông Lưng Cao Vintage"),
  ).toBeVisible();
  await expect(page.getByText("SP-POLO-012")).toBeVisible();

  const search = page.getByRole("searchbox", {
    name: "Tìm sản phẩm trong kho",
  });
  const searchBox = page.locator("label").filter({ has: search });
  const filterFields = [
    searchBox,
    page.getByLabel("Kho lưu trữ"),
    page.getByLabel("Trạng thái tồn"),
    page.getByLabel("Danh mục"),
    page.getByRole("button", { name: "Đặt lại bộ lọc" }),
  ];
  const filterHeights = await Promise.all(
    filterFields.map((field) =>
      field.evaluate((element) => element.getBoundingClientRect().height),
    ),
  );
  expect(new Set(filterHeights).size, JSON.stringify(filterHeights)).toBe(1);
  expect(
    await search.evaluate((element) => getComputedStyle(element).textOverflow),
  ).toBe("ellipsis");
  expect(
    await search.evaluate((element) => getComputedStyle(element).whiteSpace),
  ).toBe("nowrap");
  await expect(search).toHaveAttribute(
    "title",
    "Tìm theo tên, SKU, hoặc mã SKU...",
  );
  await search.fill("SP-JEAN-044");
  await expect(
    page.getByText("Quần Jean Ống Suông Lưng Cao Vintage"),
  ).toBeVisible();
  await expect(
    page.getByText("Áo sơ mi Linen Cổ Tàu Form Rộng"),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Đặt lại bộ lọc" }).click();
  await expect(search).toHaveValue("");
  await expect(
    page.getByText("Áo sơ mi Linen Cổ Tàu Form Rộng"),
  ).toBeVisible();

  await page.getByLabel("Trạng thái tồn").selectOption("low");
  await expect(
    page.getByText("Quần Jean Ống Suông Lưng Cao Vintage"),
  ).toBeVisible();
  await expect(
    page.getByText("Áo sơ mi Linen Cổ Tàu Form Rộng"),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Đặt lại bộ lọc" }).click();
  await page.getByRole("checkbox", { name: "Chọn tất cả sản phẩm" }).check();
  await expect(page.getByText("Đã chọn 6 sản phẩm")).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("inventory header actions stay inside the header at every viewport width", async ({
  page,
}) => {
  await page.goto("/shop/inventory");
  const header = page.locator('section[aria-labelledby="inventory-title"]');
  const actions = header.locator("> div").nth(1).locator("> *");
  await expect(header).toBeVisible();

  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const headerBox = await header.boundingBox();
    if (!headerBox) {
      throw new Error("Inventory header is not visible.");
    }

    for (const action of await actions.all()) {
      const actionBox = await action.boundingBox();
      if (!actionBox) {
        throw new Error("Inventory header action is not visible.");
      }
      expect(actionBox.x).toBeGreaterThanOrEqual(headerBox.x);
      expect(actionBox.x + actionBox.width).toBeLessThanOrEqual(
        headerBox.x + headerBox.width,
      );
    }
  }
});

test("inventory adjustment opens from inventory and can be canceled", async ({
  page,
}) => {
  await page.goto("/shop/inventory");
  await page.getByRole("link", { name: "Điều chỉnh tồn kho" }).click();

  await expect(page).toHaveURL("/shop/inventory/adjustment");
  await expect(
    page.getByRole("heading", { name: "Điều chỉnh Tồn kho & Cân đối WMS" }),
  ).toBeVisible();

  const adjustmentTitle = page.getByRole("heading", {
    name: "Điều chỉnh Tồn kho & Cân đối WMS",
  });
  const cancelButton = page.getByRole("link", { name: "Hủy bỏ" });
  const table = page.getByRole("table");
  const tableHeader = table.locator("th").first();
  const tableCell = table.locator("tbody td").first();
  expect(
    await adjustmentTitle.evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe("26px");
  const adjustmentHeader = page.locator(
    'section[aria-labelledby="adjustment-title"] > header',
  );
  const adjustmentTitleIcon = adjustmentHeader.locator(
    'span[aria-hidden="true"]',
  );
  const adjustmentSubtitle = adjustmentHeader.locator("> div > div > p");
  const titleBox = await adjustmentTitle.boundingBox();
  const iconBox = await adjustmentTitleIcon.boundingBox();
  const subtitleBox = await adjustmentSubtitle.boundingBox();
  if (!titleBox || !iconBox || !subtitleBox) {
    throw new Error("Adjustment page heading is not fully visible.");
  }
  expect(
    Math.abs(
      (titleBox.y + subtitleBox.y + subtitleBox.height) / 2 -
        (iconBox.y + iconBox.height / 2),
    ),
  ).toBeLessThanOrEqual(4);
  expect(subtitleBox.x).toBe(titleBox.x);
  expect(
    await cancelButton.evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe("14px");
  expect(
    await tableHeader.evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe("11px");
  expect(
    await tableCell.evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe("12px");

  const variantsTitle = page.getByRole("heading", {
    name: "Bảng phân bổ điều chỉnh chi tiết theo từng biến thể (SKU Variants)",
  });
  const variantCount = page.getByText("4 Biến thể SKU", { exact: true });
  const variantsDescription = page.locator(
    'p[title="Tự động tính toán số lượng chênh lệch thực tế, cập nhật lại dữ liệu tồn kho WMS và bật chốt đơn"]',
  );

  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const titleBox = await variantsTitle.boundingBox();
    const countBox = await variantCount.boundingBox();
    if (!titleBox || !countBox) {
      throw new Error("Variant heading or count is not visible.");
    }
    expect(
      Math.abs(
        titleBox.y + titleBox.height / 2 - (countBox.y + countBox.height / 2),
      ),
    ).toBeLessThanOrEqual(2);
    expect(
      await variantsDescription.evaluate(
        (element) => getComputedStyle(element).textOverflow,
      ),
    ).toBe("ellipsis");
    expect(
      await variantsDescription.evaluate(
        (element) => getComputedStyle(element).whiteSpace,
      ),
    ).toBe("nowrap");
    await expect(variantsDescription).toHaveAttribute(
      "title",
      "Tự động tính toán số lượng chênh lệch thực tế, cập nhật lại dữ liệu tồn kho WMS và bật chốt đơn",
    );
  }

  const approvalCard = page.getByRole("region", {
    name: "Thông tin chứng từ & Xác nhận phê duyệt",
  });
  const approvalFooter = approvalCard.locator("footer");
  const notifyLabel = approvalFooter.locator("label");
  const draftButton = approvalFooter.getByRole("button", { name: "Lưu nháp" });
  const confirmButton = approvalFooter.getByRole("button", {
    name: "Xác nhận & Cập nhật tồn kho khả dụng ngay",
  });
  expect(
    await confirmButton.evaluate((element) => getComputedStyle(element).display),
  ).toBe("flex");
  expect(
    await confirmButton.evaluate(
      (element) => getComputedStyle(element).borderRadius,
    ),
  ).toBe("8px");

  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const footerBox = await approvalFooter.boundingBox();
    if (!footerBox) {
      throw new Error("Approval actions are not visible.");
    }

    for (const action of [notifyLabel, draftButton, confirmButton]) {
      const actionBox = await action.boundingBox();
      if (!actionBox) {
        throw new Error("An approval action is not visible.");
      }
      expect(actionBox.x).toBeGreaterThanOrEqual(footerBox.x);
      expect(actionBox.x + actionBox.width).toBeLessThanOrEqual(
        footerBox.x + footerBox.width,
      );
    }

    const iconBox = await confirmButton.locator("svg").boundingBox();
    const textBox = await confirmButton.locator("span").boundingBox();
    if (!iconBox || !textBox) {
      throw new Error("Confirmation button contents are not visible.");
    }
    expect(
      Math.abs(
        iconBox.y + iconBox.height / 2 - (textBox.y + textBox.height / 2),
      ),
    ).toBeLessThanOrEqual(2);
  }
  expect(
    await notifyLabel.evaluate((element) => getComputedStyle(element).textAlign),
  ).toBe("left");

  await page.getByRole("link", { name: "Hủy bỏ" }).click();

  await expect(page).toHaveURL("/shop/inventory");
  await expect(
    page.getByRole("heading", {
      name: "Quản lý Tồn kho & Giữ chỗ Livestream",
    }),
  ).toBeVisible();
});

test("inventory adjustment can change product and sync the stock summary", async ({
  page,
}, testInfo) => {
  await page.goto("/shop/inventory/adjustment");

  const productImage = page.getByRole("img", {
    name: "Áo sơ mi Linen Cổ Tàu Form Rộng",
  });
  await expect(productImage).toBeVisible();
  const imageBox = await productImage.boundingBox();
  expect(imageBox?.width).toBe(testInfo.project.name === "mobile" ? 96 : 104);

  await page.getByRole("button", { name: "Đổi sản phẩm khác" }).click();
  const productDialog = page.getByRole("dialog", {
    name: "Chọn sản phẩm điều chỉnh tồn kho",
  });
  await expect(productDialog).toBeVisible();
  await productDialog
    .getByRole("button", { name: /Đầm Suông Tay Bồng Phong Cách Pháp/ })
    .click();

  await expect(productDialog).not.toBeVisible();
  await expect(
    page.getByRole("img", { name: "Đầm Suông Tay Bồng Phong Cách Pháp" }),
  ).toBeVisible();
  await expect(page.getByLabel("Tổng quan tồn kho")).toContainText("80");
  await expect(page.getByLabel("Tổng quan tồn kho")).toContainText("24");
  await expect(page.getByLabel("Tổng quan tồn kho")).toContainText("56");
  await expect(page.getByRole("table")).toContainText("SP-DRESS-008");
  await expect(page.getByText("1 Biến thể SKU", { exact: true })).toBeVisible();
});

test("inventory adjustment table truncates long fields and exposes full text on hover", async ({
  page,
}) => {
  await page.goto("/shop/inventory/adjustment");

  const adjustmentType = page.getByLabel("Loại điều chỉnh A001-WHT-M");
  const adjustmentReason = page.getByLabel("Lý do điều chỉnh A001-WHT-M");
  const note = page.getByLabel("Ghi chú chi tiết A001-WHT-M");

  for (const field of [adjustmentType, adjustmentReason, note]) {
    expect(
      await field.evaluate((element) => getComputedStyle(element).textOverflow),
    ).toBe("ellipsis");
  }
  await expect(adjustmentType).toHaveAttribute("title", "Kiểm đếm thực tế");
  await expect(adjustmentReason).toHaveAttribute(
    "title",
    "Kiểm kê định kỳ chênh lệch",
  );
  await expect(note).toHaveAttribute("title", "Hàng mẫu trưng bày tại phòng Live");

  await adjustmentReason.selectOption({ label: "Hàng rách/lỗi may" });
  await expect(adjustmentReason).toHaveAttribute("title", "Hàng rách/lỗi may");
  await note.fill("Ghi chú có nội dung dài cần xem đầy đủ");
  await expect(note).toHaveAttribute(
    "title",
    "Ghi chú có nội dung dài cần xem đầy đủ",
  );
});

test("inventory history can be opened and filtered", async ({ page }, testInfo) => {
  await page.goto("/shop/inventory");
  await page.getByRole("link", { name: "Nhật ký biến động" }).click();

  await expect(page).toHaveURL("/shop/inventory/history");
  await expect(
    page.getByRole("heading", {
      name: "Nhật ký Biến động Tồn kho & Audit Log",
    }),
  ).toBeVisible();
  expect(
    await page.getByRole("heading", {
      name: "Nhật ký Biến động Tồn kho & Audit Log",
    }).evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe(testInfo.project.name === "mobile" ? "24px" : "26px");
  expect(
    await page.getByRole("columnheader").first().evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe("11px");
  expect(
    await page.getByRole("row").nth(1).locator("td").first().evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe("12px");
  expect(
    await page.getByLabel("Bộ lọc nhật ký tồn kho").locator("input").evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe("12px");
  const auditFooter = page.locator("footer").filter({
    has: page.getByLabel("Phân trang nhật ký"),
  });
  const pageSizeSelect = page.getByLabel("Số bản ghi mỗi trang");
  expect(
    await pageSizeSelect.evaluate((element) => element.getBoundingClientRect().height),
  ).toBe(testInfo.project.name === "mobile" ? 23 : 26);
  const footerBounds = await auditFooter.boundingBox();
  const infoBounds = await auditFooter.locator("div").first().boundingBox();
  const paginationBounds = await page.getByLabel("Phân trang nhật ký").boundingBox();
  expect(footerBounds).not.toBeNull();
  expect(infoBounds).not.toBeNull();
  expect(paginationBounds).not.toBeNull();
  expect(
    Math.abs(
      infoBounds!.y +
        infoBounds!.height / 2 -
        (paginationBounds!.y + paginationBounds!.height / 2),
    ),
  ).toBeLessThanOrEqual(1);
  for (const filterName of [
    "TÌM KIẾM CHI TIẾT",
    "LOẠI HÀNH ĐỘNG BIẾN ĐỘNG",
    "KHO / NGUỒN PHÁT SINH",
    "THỜI GIAN",
  ]) {
    const filterField = page
      .getByLabel("Bộ lọc nhật ký tồn kho")
      .locator("label")
      .filter({ hasText: filterName });
    const control = filterField.locator("input, select");
    expect(
      await control.evaluate((element) => element.getBoundingClientRect().height),
    ).toBe(32);
    expect(
      await control.evaluate((element) => getComputedStyle(element).textOverflow),
    ).toBe("ellipsis");
  }
  const quickFilters = page.getByLabel("Phím lọc nhanh");
  for (const label of [
    "Tất cả sự kiện",
    "Chỉ xem AI Live Reserve",
    "Hoàn tồn tự động",
    "Phiếu chỉnh thủ kho",
  ]) {
    const quickFilter = quickFilters.getByRole("button", { name: new RegExp(label) });
    await expect(quickFilter.locator("span:not([aria-hidden='true'])")).toHaveText(label);
    expect(
      await quickFilter
        .locator("span:not([aria-hidden='true'])")
        .evaluate((element) => getComputedStyle(element).width),
    ).not.toBe("6px");
  }
  expect(
    await quickFilters.evaluate((element) => getComputedStyle(element).overflowX),
  ).toBe("visible");
  expect(
    await quickFilters.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  const quickFilterTops = await Promise.all(
    [
      quickFilters.getByRole("button", { name: /Tất cả sự kiện/ }),
      quickFilters.getByRole("button", { name: /Chỉ xem AI Live Reserve/ }),
      quickFilters.getByRole("button", { name: /Hoàn tồn tự động/ }),
      quickFilters.getByRole("button", { name: /Phiếu chỉnh thủ kho/ }),
      quickFilters.getByRole("button", { name: "Đặt lại mặc định" }),
    ].map((button) =>
      button.evaluate((element) => element.getBoundingClientRect().top),
    ),
  );
  expect(Math.max(...quickFilterTops) - Math.min(...quickFilterTops)).toBeLessThanOrEqual(1);
  const historyHeader = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Nhật ký Biến động Tồn kho & Audit Log",
    }),
  });
  const headingBounds = await historyHeader
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "Nhật ký Biến động Tồn kho & Audit Log" }) })
    .first()
    .boundingBox();
  const actionBounds = await historyHeader
    .getByRole("button", { name: "Bộ lọc nâng cao" })
    .locator("..")
    .boundingBox();
  expect(headingBounds).not.toBeNull();
  expect(actionBounds).not.toBeNull();
  expect(actionBounds!.y).toBeGreaterThanOrEqual(headingBounds!.y + headingBounds!.height);
  const kpiFooters = page
    .getByLabel("Tổng quan biến động kho")
    .locator("article > div:nth-child(3)");
  await expect(kpiFooters).toHaveCount(4);
  for (const footer of await kpiFooters.all()) {
    const footerLayout = await footer.evaluate((element) => ({
      whiteSpace: getComputedStyle(element).whiteSpace,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      descriptionTextOverflow: getComputedStyle(
        element.querySelector("span")!,
      ).textOverflow,
      descriptionWidth: element.querySelector("span")!.clientWidth,
      descriptionScrollWidth: element.querySelector("span")!.scrollWidth,
    }));
    expect(footerLayout.whiteSpace).toBe("nowrap");
    expect(footerLayout.scrollWidth).toBeLessThanOrEqual(footerLayout.clientWidth);
    expect(footerLayout.descriptionTextOverflow).toBe("ellipsis");
    expect(footerLayout.descriptionScrollWidth).toBeGreaterThanOrEqual(
      footerLayout.descriptionWidth,
    );
  }
  await expect(page.getByText("#ORD-9942")).toBeVisible();
  await expect(page.getByText("#ADJ-2025-0842")).toBeVisible();

  await page.getByRole("button", { name: /Hoàn tồn tự động/ }).click();
  await expect(page.getByText("#ORD-9925")).toBeVisible();
  await expect(page.getByText("#ORD-9942")).not.toBeVisible();

  await page.getByRole("button", { name: "Đặt lại mặc định" }).click();
  await expect(page.getByText("#ORD-9942")).toBeVisible();

  await page.getByRole("link", { name: "Tạo phiếu điều chỉnh" }).click();
  await expect(page).toHaveURL("/shop/inventory/adjustment");
});
