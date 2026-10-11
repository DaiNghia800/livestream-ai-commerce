/**
 * Ba cổng thanh toán điện tử — phần ký và đọc chữ ký.
 *
 * Đây là chỗ sai nhiều nhất khi nối cổng, và cũng là chỗ sai khó phát
 * hiện nhất: chữ ký lệch thì cổng từ chối với một thông báo chung
 * chung, còn thiếu kiểm chữ ký thì mọi thứ chạy ngon cho tới khi có
 * người tự gửi gói tin "đã thanh toán".
 *
 * Không có đồng nào thật ở đây. Khoá là khoá giả, endpoint là sandbox.
 */

import crypto from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSandbox,
  GatewayNotConfiguredError,
  MockGateway,
  MomoGateway,
  UnknownGatewayError,
  VnpayGateway,
  ZalopayGateway,
  getGateway,
  resetGatewayCache,
} from "../../../src/modules/payment/gateways/index.js";

const VNPAY = {
  tmnCode: "TESTTMN1",
  hashSecret: "khoa-gia-chi-dung-cho-test-khong-phai-khoa-that",
  payUrl: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
  returnUrl: "http://localhost:8000/api/payments/vnpay/return",
};

const MOMO = {
  partnerCode: "MOMOTEST",
  accessKey: "access-key-gia",
  secretKey: "secret-key-gia",
  createUrl: "https://test-payment.momo.vn/v2/gateway/api/create",
  returnUrl: "http://localhost:8000/api/payments/momo/return",
  ipnUrl: "http://localhost:8000/api/payments/momo/ipn",
};

const ZALO = {
  appId: "2553",
  key1: "key1-gia",
  key2: "key2-gia",
  createUrl: "https://sb-openapi.zalopay.vn/v2/create",
  callbackUrl: "http://localhost:8000/api/payments/zalopay/callback",
};

afterEach(() => {
  vi.restoreAllMocks();
  resetGatewayCache();
});

/**
 * Ký theo đúng đặc tả VNPay, viết độc lập với phần cài đặt.
 *
 * Chép lại cài đặt thì test chỉ chứng minh code bằng chính nó. Ở đây
 * dựng lại từ tài liệu: sắp khoá theo bảng chữ cái, mã hoá URL giá
 * trị rồi đổi %20 thành dấu cộng, nối bằng & và HMAC-SHA512.
 */
function kyVnpay(params: Record<string, string>, secret: string): string {
  const data = Object.keys(params)
    .filter((k) => params[k] !== "")
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]).replace(/%20/g, "+")}`)
    .join("&");
  return crypto.createHmac("sha512", secret).update(Buffer.from(data, "utf-8")).digest("hex");
}

describe("assertSandbox — rào chắn tiền thật", () => {
  it("cho qua các endpoint sandbox chính thức", () => {
    expect(() => assertSandbox(VNPAY.payUrl, "vnpay")).not.toThrow();
    expect(() => assertSandbox(MOMO.createUrl, "momo")).not.toThrow();
    expect(() => assertSandbox(ZALO.createUrl, "zalopay")).not.toThrow();
    expect(() => assertSandbox("http://localhost:8000/x", "mock")).not.toThrow();
  });

  it("CHẶN endpoint thật của VNPay", () => {
    // Một dòng cấu hình chép nhầm từ tài liệu nhà cung cấp là đủ để
    // chuyển sang môi trường thật mà không ai nhận ra.
    expect(() =>
      assertSandbox("https://pay.vnpay.vn/vpcpay.html", "vnpay")
    ).toThrow("không nằm trong danh sách sandbox");
  });

  it("CHẶN endpoint thật của MoMo", () => {
    expect(() =>
      assertSandbox("https://payment.momo.vn/v2/gateway/api/create", "momo")
    ).toThrow("sandbox");
  });

  it("URL hỏng cũng bị chặn", () => {
    expect(() => assertSandbox("khong-phai-url", "vnpay")).toThrow("không hợp lệ");
  });
});

describe("VNPay", () => {
  const gateway = new VnpayGateway(VNPAY);

  it("từ chối khởi tạo khi trỏ sang endpoint thật", () => {
    expect(
      () => new VnpayGateway({ ...VNPAY, payUrl: "https://pay.vnpay.vn/vpcpay.html" })
    ).toThrow("sandbox");
  });

  it("từ chối khởi tạo khi thiếu khoá", () => {
    expect(() => new VnpayGateway({ ...VNPAY, hashSecret: "" })).toThrow(
      "VNPAY_HASH_SECRET"
    );
  });

  it("nhân số tiền với 100", async () => {
    const { payUrl } = await gateway.createCheckout({
      txnRef: "LIVE20261010ABC1",
      amount: "398000",
      orderCode: "LIVE-20261010-abc1",
      clientIp: "1.2.3.4",
    });

    // VNPay tính bằng đơn vị nhỏ nhất. Quên nhân 100 thì khách trả
    // đúng 1/100 số tiền và sổ sách lệch mà không ai thấy lỗi ở đâu.
    expect(new URL(payUrl).searchParams.get("vnp_Amount")).toBe("39800000");
  });

  it("đường dẫn trỏ về sandbox và mang đủ tham số bắt buộc", async () => {
    const { payUrl } = await gateway.createCheckout({
      txnRef: "LIVE20261010ABC1",
      amount: "100000",
      orderCode: "LIVE-20261010-abc1",
      clientIp: "1.2.3.4",
    });
    const url = new URL(payUrl);

    expect(url.hostname).toBe("sandbox.vnpayment.vn");
    for (const k of [
      "vnp_Version",
      "vnp_TmnCode",
      "vnp_TxnRef",
      "vnp_IpAddr",
      "vnp_CreateDate",
      "vnp_ExpireDate",
      "vnp_SecureHash",
    ]) {
      expect(url.searchParams.get(k)).toBeTruthy();
    }
  });

  it("chữ ký trên đường dẫn khớp với đặc tả", async () => {
    const { payUrl } = await gateway.createCheckout({
      txnRef: "LIVE20261010ABC1",
      amount: "100000",
      orderCode: "LIVE-20261010-abc1",
      clientIp: "1.2.3.4",
    });
    const url = new URL(payUrl);
    const nhan = url.searchParams.get("vnp_SecureHash")!;

    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      if (k !== "vnp_SecureHash") params[k] = v;
    });

    expect(nhan).toBe(kyVnpay(params, VNPAY.hashSecret));
  });

  it("hạn thanh toán 15 phút, khớp tầng hai của TTL giữ hàng", async () => {
    const { payUrl } = await gateway.createCheckout({
      txnRef: "T1",
      amount: "1000",
      orderCode: "O1",
      clientIp: "1.2.3.4",
    });
    const url = new URL(payUrl);
    const doc = (s: string) =>
      Date.UTC(
        +s.slice(0, 4),
        +s.slice(4, 6) - 1,
        +s.slice(6, 8),
        +s.slice(8, 10),
        +s.slice(10, 12),
        +s.slice(12, 14)
      );

    // Để dài hơn thì hàng đã trả về kho mà khách vẫn trả tiền được.
    const chenh =
      doc(url.searchParams.get("vnp_ExpireDate")!) -
      doc(url.searchParams.get("vnp_CreateDate")!);
    expect(Math.round(chenh / 60000)).toBe(15);
  });

  it("đọc được IPN hợp lệ", () => {
    const params: Record<string, string> = {
      vnp_TxnRef: "LIVE20261010ABC1",
      vnp_Amount: "39800000",
      vnp_TransactionNo: "14512345",
      vnp_ResponseCode: "00",
      vnp_TransactionStatus: "00",
    };
    const result = gateway.parseCallback(
      { ...params, vnp_SecureHash: kyVnpay(params, VNPAY.hashSecret) },
      "IPN"
    );

    expect(result.signatureValid).toBe(true);
    expect(result.succeeded).toBe(true);
    expect(result.txnRef).toBe("LIVE20261010ABC1");
    expect(result.providerTxnId).toBe("14512345");
    // Chia lại 100 để về đơn vị đồng.
    expect(result.amount).toBe("398000");
  });

  it("gói tin bị SỬA thì chữ ký không khớp", () => {
    const params: Record<string, string> = {
      vnp_TxnRef: "T1",
      vnp_Amount: "100000",
      vnp_TransactionNo: "1",
      vnp_ResponseCode: "00",
      vnp_TransactionStatus: "00",
    };
    const hash = kyVnpay(params, VNPAY.hashSecret);

    // Kẻ tấn công sửa số tiền sau khi đã có chữ ký hợp lệ của gói cũ.
    const result = gateway.parseCallback(
      { ...params, vnp_Amount: "999999999", vnp_SecureHash: hash },
      "IPN"
    );
    expect(result.signatureValid).toBe(false);
  });

  it("ký bằng khoá khác thì không qua được", () => {
    const params = { vnp_TxnRef: "T1", vnp_Amount: "100000", vnp_ResponseCode: "00" };
    const result = gateway.parseCallback(
      { ...params, vnp_SecureHash: kyVnpay(params, "khoa-khac") },
      "IPN"
    );
    expect(result.signatureValid).toBe(false);
  });

  it("thiếu chữ ký cũng không qua", () => {
    expect(
      gateway.parseCallback({ vnp_TxnRef: "T1", vnp_Amount: "1" }, "IPN").signatureValid
    ).toBe(false);
  });

  it("PHẢI đúng CẢ HAI mã mới tính là thành công", () => {
    const base = { vnp_TxnRef: "T1", vnp_Amount: "100000", vnp_TransactionNo: "1" };

    // vnp_ResponseCode nói giao dịch được chấp nhận, còn
    // vnp_TransactionStatus mới nói tiền đã thực sự chuyển.
    const chiMotMa = { ...base, vnp_ResponseCode: "00", vnp_TransactionStatus: "02" };
    expect(
      gateway.parseCallback(
        { ...chiMotMa, vnp_SecureHash: kyVnpay(chiMotMa, VNPAY.hashSecret) },
        "IPN"
      ).succeeded
    ).toBe(false);
  });

  it("khách huỷ giữa chừng thì succeeded = false", () => {
    const p = {
      vnp_TxnRef: "T1",
      vnp_Amount: "100000",
      vnp_TransactionNo: "1",
      vnp_ResponseCode: "24",
      vnp_TransactionStatus: "02",
    };
    const r = gateway.parseCallback(
      { ...p, vnp_SecureHash: kyVnpay(p, VNPAY.hashSecret) },
      "IPN"
    );
    expect(r.succeeded).toBe(false);
    expect(r.responseCode).toBe("24");
  });

  it("thiếu mã giao dịch thì vẫn có khoá chống trùng để bám", () => {
    const p = { vnp_TxnRef: "T1", vnp_Amount: "1", vnp_ResponseCode: "00" };
    const r = gateway.parseCallback(
      { ...p, vnp_SecureHash: kyVnpay(p, VNPAY.hashSecret) },
      "IPN"
    );
    expect(r.providerTxnId).toBe("T1-IPN");
  });

  it("phản hồi IPN luôn HTTP 200 kèm RspCode", () => {
    // Mã HTTP khác 200 bị VNPay coi là ta sập và họ sẽ bắn lại.
    expect(gateway.acknowledge("SUCCESS")).toEqual({
      status: 200,
      body: { RspCode: "00", Message: "Confirm Success" },
    });
    expect((gateway.acknowledge("INVALID_SIGNATURE").body as never)["RspCode"]).toBe("97");
    expect((gateway.acknowledge("INVALID_AMOUNT").body as never)["RspCode"]).toBe("04");
    expect((gateway.acknowledge("ALREADY_CONFIRMED").body as never)["RspCode"]).toBe("02");
    expect((gateway.acknowledge("ORDER_NOT_FOUND").body as never)["RspCode"]).toBe("01");
    expect((gateway.acknowledge("ERROR").body as never)["RspCode"]).toBe("99");
  });
});

describe("MoMo", () => {
  const gateway = new MomoGateway(MOMO);

  function kyMomo(data: string) {
    return crypto.createHmac("sha256", MOMO.secretKey).update(data).digest("hex");
  }

  it("từ chối endpoint thật", () => {
    expect(
      () =>
        new MomoGateway({
          ...MOMO,
          createUrl: "https://payment.momo.vn/v2/gateway/api/create",
        })
    ).toThrow("sandbox");
  });

  it("thiếu khoá thì báo rõ thiếu gì", () => {
    expect(() => new MomoGateway({ ...MOMO, secretKey: "" })).toThrow(
      "MOMO_SECRET_KEY"
    );
  });

  it("gọi sang sandbox và trả về payUrl", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ resultCode: 0, payUrl: "https://test-payment.momo.vn/pay/abc" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await gateway.createCheckout({
      txnRef: "LIVE20261010ABC1",
      amount: "398000",
      orderCode: "LIVE-20261010-abc1",
      clientIp: "1.2.3.4",
    });

    expect(result.payUrl).toBe("https://test-payment.momo.vn/pay/abc");
    expect(String(fetchMock.mock.calls[0][0])).toContain("test-payment.momo.vn");

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    // MoMo tính bằng đồng, KHÔNG nhân 100 như VNPay.
    expect(body.amount).toBe("398000");
    expect(body.signature).toHaveLength(64);
  });

  it("resultCode khác 0 thì ném lỗi thay vì trả payUrl rỗng", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ resultCode: 99, message: "sai chu ky" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    // Trả về đường dẫn rỗng sẽ đẩy khách sang một trang trắng.
    await expect(
      gateway.createCheckout({
        txnRef: "T1",
        amount: "1000",
        orderCode: "O1",
        clientIp: "1.2.3.4",
      })
    ).rejects.toThrow("99");
  });

  it("cổng treo thì bỏ cuộc theo timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_u, init) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            rej(e);
          });
        })
    );

    const nhanh = new MomoGateway({ ...MOMO, timeoutMs: 30 });
    await expect(
      nhanh.createCheckout({ txnRef: "T", amount: "1", orderCode: "O", clientIp: "1.1.1.1" })
    ).rejects.toThrow("không phản hồi");
  });

  it("HTTP lỗi thì ném lỗi", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
      gateway.createCheckout({ txnRef: "T", amount: "1", orderCode: "O", clientIp: "1.1.1.1" })
    ).rejects.toThrow("503");
  });

  it("đọc được IPN hợp lệ", () => {
    const p: Record<string, string | number> = {
      partnerCode: MOMO.partnerCode,
      orderId: "LIVE20261010ABC1",
      requestId: "LIVE20261010ABC1-1",
      amount: 398000,
      orderInfo: "Thanh toan don",
      orderType: "momo_wallet",
      transId: 2147483647,
      resultCode: 0,
      message: "Successful.",
      payType: "qr",
      responseTime: 1728500000000,
      extraData: "",
    };
    const raw =
      `accessKey=${MOMO.accessKey}&amount=${p.amount}&extraData=${p.extraData}` +
      `&message=${p.message}&orderId=${p.orderId}&orderInfo=${p.orderInfo}` +
      `&orderType=${p.orderType}&partnerCode=${p.partnerCode}&payType=${p.payType}` +
      `&requestId=${p.requestId}&responseTime=${p.responseTime}` +
      `&resultCode=${p.resultCode}&transId=${p.transId}`;

    const r = gateway.parseCallback({ ...p, signature: kyMomo(raw) });

    expect(r.signatureValid).toBe(true);
    expect(r.succeeded).toBe(true);
    expect(r.amount).toBe("398000");
    expect(r.providerTxnId).toBe("2147483647");
  });

  it("chữ ký sai thì từ chối", () => {
    expect(
      gateway.parseCallback({ orderId: "T1", amount: 1000, resultCode: 0, signature: "sai" })
        .signatureValid
    ).toBe(false);
  });

  it("phản hồi 204 khi đã nhận, 400 khi hỏng", () => {
    expect(gateway.acknowledge("SUCCESS").status).toBe(204);
    expect(gateway.acknowledge("ALREADY_CONFIRMED").status).toBe(204);
    expect(gateway.acknowledge("INVALID_SIGNATURE").status).toBe(400);
  });
});

describe("ZaloPay", () => {
  const gateway = new ZalopayGateway(ZALO);

  it("từ chối khi thiếu khoá", () => {
    expect(() => new ZalopayGateway({ ...ZALO, key2: "" })).toThrow("ZALOPAY_KEY2");
  });

  it("app_trans_id bắt đầu bằng yymmdd của hôm nay", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ return_code: 1, order_url: "https://sb-openapi.zalopay.vn/pay/x" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const r = await gateway.createCheckout({
      txnRef: "LIVE20261010ABC1",
      amount: "398000",
      orderCode: "LIVE-20261010-abc1",
      clientIp: "1.2.3.4",
    });

    // ZaloPay bắt buộc định dạng này; sai thì bị từ chối với một thông
    // báo rất chung chung.
    const vn = new Date(Date.now() + 7 * 3600_000);
    const yymmdd =
      String(vn.getUTCFullYear()).slice(2) +
      String(vn.getUTCMonth() + 1).padStart(2, "0") +
      String(vn.getUTCDate()).padStart(2, "0");
    expect(r.providerRef!.startsWith(`${yymmdd}_`)).toBe(true);
  });

  it("return_code khác 1 thì ném lỗi", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ return_code: -1, return_message: "sai mac" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    await expect(
      gateway.createCheckout({ txnRef: "T", amount: "1", orderCode: "O", clientIp: "1.1.1.1" })
    ).rejects.toThrow("sai mac");
  });

  it("callback ký bằng KEY2, không phải key1", () => {
    const data = JSON.stringify({
      app_trans_id: "261010_LIVE20261010ABC1",
      zp_trans_id: 220909000000001,
      amount: 398000,
    });

    const dungKey2 = crypto.createHmac("sha256", ZALO.key2).update(data).digest("hex");
    const nhamKey1 = crypto.createHmac("sha256", ZALO.key1).update(data).digest("hex");

    expect(gateway.parseCallback({ data, mac: dungKey2 }).signatureValid).toBe(true);
    // Dùng nhầm khoá thì tạo được đơn nhưng mọi callback đều bị coi là
    // giả mạo — và lỗi đó chỉ lộ ra sau khi khách đã trả tiền.
    expect(gateway.parseCallback({ data, mac: nhamKey1 }).signatureValid).toBe(false);
  });

  it("bỏ tiền tố ngày để lấy lại nội dung đối soát", () => {
    const data = JSON.stringify({
      app_trans_id: "261010_LIVE20261010ABC1",
      zp_trans_id: 123,
      amount: 1000,
    });
    const r = gateway.parseCallback({
      data,
      mac: crypto.createHmac("sha256", ZALO.key2).update(data).digest("hex"),
    });
    expect(r.txnRef).toBe("LIVE20261010ABC1");
    expect(r.providerTxnId).toBe("123");
  });

  it("gói data hỏng thì coi như chữ ký sai, không đoán mò", () => {
    const r = gateway.parseCallback({ data: "{khong-phai-json", mac: "x" });
    expect(r.signatureValid).toBe(false);
    expect(r.responseCode).toBe("PARSE_ERROR");
  });

  it("phản hồi dùng return_code", () => {
    expect((gateway.acknowledge("SUCCESS").body as never)["return_code"]).toBe(1);
    expect((gateway.acknowledge("INVALID_SIGNATURE").body as never)["return_code"]).toBe(-1);
  });
});

describe("MockGateway — chạy hoàn toàn trong máy", () => {
  const gateway = new MockGateway({
    baseUrl: "http://localhost:8000",
    secret: "mock-secret-gia",
  });

  it("trỏ về trang thanh toán giả của chính service", async () => {
    const r = await gateway.createCheckout({
      txnRef: "T1",
      amount: "1000",
      orderCode: "O1",
      clientIp: "1.1.1.1",
    });
    expect(r.payUrl).toContain("/api/payments/mock/checkout");
    expect(r.payUrl).toContain("txnRef=T1");
  });

  it("vẫn ký và vẫn kiểm chữ ký thật", () => {
    const fields = {
      txnRef: "T1",
      amount: "1000",
      providerTxnId: "MOCK-1",
      resultCode: "00",
    };
    const ok = gateway.parseCallback({ ...fields, signature: gateway.sign(fields) });

    // Nhờ vậy nó đi qua đúng những đoạn code mà cổng thật đi qua.
    expect(ok.signatureValid).toBe(true);
    expect(ok.succeeded).toBe(true);
    expect(gateway.parseCallback({ ...fields, signature: "sai" }).signatureValid).toBe(
      false
    );
  });

  it("mô phỏng được cả trường hợp khách huỷ", () => {
    const fields = {
      txnRef: "T1",
      amount: "1000",
      providerTxnId: "MOCK-1",
      resultCode: "24",
    };
    const r = gateway.parseCallback({ ...fields, signature: gateway.sign(fields) });
    expect(r.signatureValid).toBe(true);
    expect(r.succeeded).toBe(false);
  });
});

describe("Chọn cổng theo tên", () => {
  it("dựng được cả bốn cổng", () => {
    for (const name of ["mock", "vnpay", "momo", "zalopay"]) {
      expect(getGateway(name).name).toBe(name);
    }
  });

  it("dùng lại thực thể đã dựng", () => {
    expect(getGateway("mock")).toBe(getGateway("mock"));
  });

  it("tên lạ thì báo rõ hỗ trợ những gì", () => {
    expect(() => getGateway("paypal")).toThrow(UnknownGatewayError);
    expect(() => getGateway("paypal")).toThrow("mock, vnpay, momo, zalopay");
  });

  it("không nêu tên thì dùng cổng mặc định", () => {
    // Mặc định là cổng giả: người mới kéo repo về chạy được ngay cả
    // luồng thanh toán mà không cần đăng ký ở nhà cung cấp nào.
    expect(getGateway().name).toBe("mock");
  });
});

describe("Gói tin thiếu trường — nhánh giá trị mặc định", () => {
  /**
   * Cổng gửi gói thiếu trường là chuyện có thật: phiên bản API đổi,
   * proxy cắt bớt, hoặc có người tự gọi tay vào endpoint. Code phải
   * trả về "không hợp lệ" chứ không được ném lỗi — ném lỗi nghĩa là
   * cổng nhận HTTP 500 và bắn lại mãi.
   */
  it("MockGateway đọc được gói rỗng", () => {
    const g = new MockGateway({ baseUrl: "http://localhost:8000", secret: "s" });
    const r = g.parseCallback({});

    expect(r.signatureValid).toBe(false);
    expect(r.txnRef).toBe("");
    expect(r.amount).toBe("0");
    // Không có resultCode thì mặc định là "00", nhưng chữ ký sai nên
    // vẫn bị chặn ở tầng trên.
    expect(r.responseCode).toBe("00");
  });

  it("MoMo đọc được gói thiếu các trường tuỳ chọn", () => {
    const g = new MomoGateway(MOMO);
    const r = g.parseCallback({ orderId: "T1", amount: 1000, resultCode: 0, transId: 9 });

    expect(r.signatureValid).toBe(false);
    expect(r.txnRef).toBe("T1");
    expect(r.providerTxnId).toBe("9");
  });

  it("MoMo đọc được gói rỗng hoàn toàn", () => {
    const g = new MomoGateway(MOMO);
    const r = g.parseCallback({});
    expect(r.signatureValid).toBe(false);
    expect(r.amount).toBe("0");
    expect(r.succeeded).toBe(false);
  });

  it("ZaloPay đọc được gói rỗng", () => {
    const g = new ZalopayGateway(ZALO);
    const r = g.parseCallback({});
    expect(r.signatureValid).toBe(false);
    expect(r.txnRef).toBe("");
  });

  it("ZaloPay chấp nhận app_trans_id không có tiền tố ngày", () => {
    const g = new ZalopayGateway(ZALO);
    const data = JSON.stringify({ app_trans_id: "KHONGCOGACHDUOI", amount: 1000 });
    const r = g.parseCallback({
      data,
      mac: crypto.createHmac("sha256", ZALO.key2).update(data).digest("hex"),
    });

    // Không có dấu gạch dưới thì lấy nguyên chuỗi, không cắt bừa.
    expect(r.txnRef).toBe("KHONGCOGACHDUOI");
    expect(r.providerTxnId).toBe("KHONGCOGACHDUOI");
  });

  it("ZaloPay: cổng treo thì bỏ cuộc theo timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_u, init) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            rej(e);
          });
        })
    );
    const nhanh = new ZalopayGateway({ ...ZALO, timeoutMs: 30 });
    await expect(
      nhanh.createCheckout({ txnRef: "T", amount: "1", orderCode: "O", clientIp: "1.1.1.1" })
    ).rejects.toThrow("không phản hồi");
  });

  it("ZaloPay: HTTP lỗi thì ném lỗi", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 502 }));
    await expect(
      new ZalopayGateway(ZALO).createCheckout({
        txnRef: "T",
        amount: "1",
        orderCode: "O",
        clientIp: "1.1.1.1",
      })
    ).rejects.toThrow("502");
  });

  it("ZaloPay: mạng chết thì để lỗi gốc nổi lên", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      new ZalopayGateway(ZALO).createCheckout({
        txnRef: "T",
        amount: "1",
        orderCode: "O",
        clientIp: "1.1.1.1",
      })
    ).rejects.toThrow("ECONNREFUSED");
  });

  it("MoMo: mạng chết thì để lỗi gốc nổi lên", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ENOTFOUND"));
    await expect(
      new MomoGateway(MOMO).createCheckout({
        txnRef: "T",
        amount: "1",
        orderCode: "O",
        clientIp: "1.1.1.1",
      })
    ).rejects.toThrow("ENOTFOUND");
  });

  it("VNPay: locale mặc định là vn", async () => {
    const { payUrl } = await new VnpayGateway(VNPAY).createCheckout({
      txnRef: "T",
      amount: "1000",
      orderCode: "O",
      clientIp: "1.1.1.1",
    });
    expect(new URL(payUrl).searchParams.get("vnp_Locale")).toBe("vn");
  });

  it("VNPay: đổi được sang tiếng Anh", async () => {
    const { payUrl } = await new VnpayGateway(VNPAY).createCheckout({
      txnRef: "T",
      amount: "1000",
      orderCode: "O",
      clientIp: "1.1.1.1",
      locale: "en",
    });
    expect(new URL(payUrl).searchParams.get("vnp_Locale")).toBe("en");
  });

  it("MoMo: lang mặc định là vi", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ resultCode: 0, payUrl: "https://test-payment.momo.vn/x" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    await new MomoGateway(MOMO).createCheckout({
      txnRef: "T",
      amount: "1000",
      orderCode: "O",
      clientIp: "1.1.1.1",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).lang).toBe("vi");
  });
});

describe("ZaloPay — nốt mấy nhánh mặc định", () => {
  const gateway = new ZalopayGateway(ZALO);

  function kyData(data: string) {
    return crypto.createHmac("sha256", ZALO.key2).update(data).digest("hex");
  }

  it("return_code lỗi mà KHÔNG kèm thông báo vẫn ném lỗi đọc được", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ return_code: -2 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    await expect(
      gateway.createCheckout({ txnRef: "T", amount: "1", orderCode: "O", clientIp: "1.1.1.1" })
    ).rejects.toThrow("-2");
  });

  it("thiếu zp_trans_id thì lấy app_trans_id làm khoá chống trùng", async () => {
    const data = JSON.stringify({ app_trans_id: "261010_T1", amount: 1000 });
    // Không có mã giao dịch của ZaloPay thì vẫn phải có thứ gì đó duy
    // nhất để chặn callback bắn lại.
    expect(gateway.parseCallback({ data, mac: kyData(data) }).providerTxnId).toBe(
      "261010_T1"
    );
  });

  it("thiếu amount thì trả 0, không trả undefined", async () => {
    const data = JSON.stringify({ app_trans_id: "261010_T1", zp_trans_id: 9 });
    // undefined lọt xuống phép so số tiền sẽ thành NaN, mà NaN so với
    // gì cũng false — khoản thu hợp lệ bị từ chối oan.
    expect(gateway.parseCallback({ data, mac: kyData(data) }).amount).toBe("0");
  });
});

describe("Cổng chưa cấu hình", () => {
  it("nêu thẳng biến môi trường nào còn thiếu", () => {
    // Người vận hành nhìn thông điệp là biết điền gì, không phải đi
    // đọc mã nguồn.
    expect(() => new VnpayGateway({ ...VNPAY, tmnCode: "", hashSecret: "" }))
      .toThrow("VNPAY_TMN_CODE, VNPAY_HASH_SECRET");
    expect(() => new MomoGateway({ ...MOMO, accessKey: "" }))
      .toThrow("MOMO_ACCESS_KEY");
    expect(() => new ZalopayGateway({ ...ZALO, key2: "" }))
      .toThrow("ZALOPAY_KEY2");
  });

  it("là kiểu lỗi riêng, không lẫn với sự cố hệ thống", () => {
    try {
      new VnpayGateway({ ...VNPAY, hashSecret: "" });
      throw new Error("đáng lẽ phải ném");
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayNotConfiguredError);
      expect((err as GatewayNotConfiguredError).gateway).toBe("vnpay");
      expect((err as GatewayNotConfiguredError).missing).toEqual([
        "VNPAY_HASH_SECRET",
      ]);
    }
  });
});
