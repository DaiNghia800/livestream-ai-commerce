import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import {
    InMemoryLivestreamRepository,
} from "../../../src/modules/livestream/repositories/livestream.repository.js";

const VALID_MERCHANT_ID =
    "a0000000-0000-0000-0000-000000000001";

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * API / Component Tests
 *
 * Dùng Express + Supertest + InMemoryLivestreamRepository.
 * Không sử dụng PostgreSQL thật trong nhóm này.
 *
 * Mỗi test được đặt tên theo TC ID trong tài liệu Test Case.
 */
describe("POST /api/livestreams - API/Component Tests", () => {
    let mockRepo: InMemoryLivestreamRepository;
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
        // Tạo repository mới cho mỗi test để tránh dữ liệu test trước
        // ảnh hưởng đến test sau.
        mockRepo = new InMemoryLivestreamRepository();
        app = createApp(mockRepo);
    });

    // =========================================================
    // AC01 - title là bắt buộc
    // =========================================================

    it("TC-CL-001 - Create livestream with valid title -> HTTP 201", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Live Sale",
            });

        expect(res.status).toBe(201);
        expect(res.body.title).toBe("Live Sale");
    });

    it("TC-CL-002 - Missing title -> HTTP 400", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                description: "Không có title",
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("ValidationError");
    });

    // =========================================================
    // AC02 - title sau trim không được rỗng
    // =========================================================

    it('TC-CL-003 - Empty title "" -> HTTP 400', async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "",
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("ValidationError");
    });

    it("TC-CL-004 - Whitespace-only title -> HTTP 400", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "     ",
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("ValidationError");
    });

    it("TC-CL-005 - Trim leading and trailing whitespace from title", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "   Live Sale   ",
            });

        expect(res.status).toBe(201);
        expect(res.body.title).toBe("Live Sale");
    });

    // =========================================================
    // AC03 - title tối đa 255 ký tự
    // Boundary Value Analysis: 254 / 255 / 256
    // =========================================================

    it("TC-CL-006 - Title with 254 characters -> HTTP 201", async () => {
        const title = "A".repeat(254);

        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title,
            });

        expect(res.status).toBe(201);
        expect(res.body.title).toBe(title);
        expect(res.body.title.length).toBe(254);
    });

    it("TC-CL-007 - Title with 255 characters -> HTTP 201", async () => {
        const title = "A".repeat(255);

        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title,
            });

        expect(res.status).toBe(201);
        expect(res.body.title).toBe(title);
        expect(res.body.title.length).toBe(255);
    });

    it("TC-CL-008 - Title with 256 characters -> HTTP 400", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "A".repeat(256),
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("ValidationError");
    });

    // =========================================================
    // AC04 - description là optional
    // =========================================================

    it("TC-CL-009 - Omit description -> HTTP 201 and description is null", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Live without description",
            });

        expect(res.status).toBe(201);
        expect(res.body.description).toBeNull();
    });

    it("TC-CL-010 - Valid description is preserved", async () => {
        const description = "Sale các sản phẩm mới";

        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Live Sale",
                description,
            });

        expect(res.status).toBe(201);
        expect(res.body.description).toBe(description);
    });

    // =========================================================
    // AC05 - scheduledAt optional, nếu có phải ISO-8601 hợp lệ
    // =========================================================

    it("TC-CL-011 - Omit scheduledAt -> HTTP 201 and scheduledAt is null", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Live without schedule",
            });

        expect(res.status).toBe(201);
        expect(res.body.scheduledAt).toBeNull();
    });

    it("TC-CL-012 - Valid scheduledAt is preserved", async () => {
        const scheduledAt = "2026-10-15T19:00:00.000Z";

        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Scheduled Live",
                scheduledAt,
            });

        expect(res.status).toBe(201);
        expect(res.body.scheduledAt).toBe(scheduledAt);
    });

    it("TC-CL-013 - Invalid scheduledAt -> HTTP 400", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Scheduled Live",
                scheduledAt: "abc",
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("ValidationError");
    });

    // =========================================================
    // AC06 - status mặc định = draft
    // =========================================================

    it('TC-CL-014 - New livestream has default status "draft"', async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Draft Livestream",
            });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe("draft");
    });

    // =========================================================
    // AC07 - Livestream thuộc Merchant thực hiện request
    // =========================================================

    it("TC-CL-015 - Valid Merchant UUID -> livestream belongs to merchant", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Merchant Live",
            });

        expect(res.status).toBe(201);
        expect(res.body.merchantId).toBe(VALID_MERCHANT_ID);
    });

    it("TC-CL-016 - Invalid Merchant UUID -> HTTP 400", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", "abc")
            .send({
                title: "Invalid Merchant",
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("BadRequest");
        expect(res.body.message).toContain("Must be a valid UUID");
    });

    it("TC-CL-017 - Missing X-Merchant-Id -> HTTP 400", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .send({
                title: "Missing Merchant",
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("BadRequest");
        expect(res.body.message).toContain(
            "X-Merchant-Id header is required",
        );
    });

    // =========================================================
    // AC08 - Client không được tự thiết lập field hệ thống
    // =========================================================

    it("TC-CL-018 - Client provides status -> HTTP 400", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Hack Status",
                status: "live",
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("ValidationError");
    });

    it("TC-CL-019 - Client provides id -> HTTP 400", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                id: "550e8400-e29b-41d4-a716-446655440000",
                title: "Custom ID",
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("ValidationError");
    });

    it("TC-CL-020 - Client provides merchantId in body -> HTTP 400", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Merchant ID Injection",
                merchantId: "550e8400-e29b-41d4-a716-446655440000",
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("ValidationError");
    });

    // =========================================================
    // AC09 - Response khi tạo thành công
    // =========================================================

    it("TC-CL-021 - Successful creation returns HTTP 201 and complete livestream data", async () => {
        const scheduledAt = "2026-10-15T19:00:00.000Z";

        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Full Livestream Response",
                description: "Test response",
                scheduledAt,
            });

        expect(res.status).toBe(201);

        expect(UUID_REGEX.test(res.body.id)).toBe(true);

        expect(res.body.merchantId).toBe(VALID_MERCHANT_ID);
        expect(res.body.title).toBe("Full Livestream Response");
        expect(res.body.description).toBe("Test response");
        expect(res.body.status).toBe("draft");

        expect(res.body.scheduledAt).toBe(scheduledAt);

        expect(res.body.playbackUrl).toBeNull();
        expect(res.body.startedAt).toBeNull();
        expect(res.body.endedAt).toBeNull();

        expect(res.body.createdAt).toBeDefined();
        expect(res.body.updatedAt).toBeDefined();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // =========================================================
    // AC11 - Invalid input không được lưu
    // =========================================================

    it("TC-CL-023 - Invalid request must not persist rejected data", async () => {
        const rejectedId =
            "11111111-1111-4111-8111-111111111111";

        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                id: rejectedId,
                title: "",
            });

        expect(res.status).toBe(400);

        const stored = await mockRepo.findById(rejectedId);

        expect(stored).toBeNull();
    });

    // =========================================================
    // AC12 - Internal server error handling
    // =========================================================

    it("TC-CL-024 - Unexpected error during livestream creation -> HTTP 500", async () => {
        vi.spyOn(mockRepo, "create").mockRejectedValueOnce(
            new Error("Unexpected repository failure")
        );
        vi.spyOn(console, "error").mockImplementation(() => {});

        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Internal Error Live",
            });

        expect(res.status).toBe(500);
        expect(res.body.error).toBe("InternalServerError");
        expect(res.body.message).toBe("Failed to create livestream session");
    });

    // =========================================================
    // AC13 - Cover Image Key (S3 Object Key) handling
    // =========================================================

    it("TC-CL-025 - Create livestream with valid coverImageKey -> HTTP 201 with coverImageKey", async () => {
        const coverKey = "livestreams/covers/a1b2c3d4-e5f6-47a8-b9c0-123456789abc.webp";
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Live With Cover Key",
                coverImageKey: coverKey,
            });

        expect(res.status).toBe(201);
        expect(res.body.coverImageKey).toBe(coverKey);

        const stored = await mockRepo.findById(res.body.id);
        expect(stored?.coverImageKey).toBe(coverKey);
    });

    it("TC-CL-026 - Create livestream with coverImageKey null -> HTTP 201 with coverImageKey null", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Live Without Cover Null",
                coverImageKey: null,
            });

        expect(res.status).toBe(201);
        expect(res.body.coverImageKey).toBeNull();
    });

    it("TC-CL-027 - Create livestream omitting coverImageKey -> HTTP 201 with coverImageKey null", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Live Without Cover Omitted",
            });

        expect(res.status).toBe(201);
        expect(res.body.coverImageKey).toBeNull();
    });

    it("TC-CL-028 - Reject coverImageKey exceeding 1024 characters -> HTTP 400", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .send({
                title: "Live With Huge Key",
                coverImageKey: "a".repeat(1025),
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("ValidationError");
        expect(res.body.message).toContain("coverImageKey cannot exceed 1024 characters");
    });

    it("TC-CL-029 - Reject malformed JSON body -> HTTP 400 BadRequest", async () => {
        const res = await request(app)
            .post("/api/livestreams")
            .set("X-Merchant-Id", VALID_MERCHANT_ID)
            .set("Content-Type", "application/json")
            .send('{"title": "Unclosed JSON');

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("BadRequest");
        expect(res.body.message).toBe("Malformed JSON payload in request body");
    });

    // =========================================================
    // Healthcheck endpoint
    // =========================================================

    it("TC-HC-001 - GET /health -> HTTP 200 with status ok", async () => {
        const res = await request(app).get("/health");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            status: "ok",
            service: "Commerce Service",
        });
    });
});