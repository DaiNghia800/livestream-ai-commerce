import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import { S3StorageService } from "../../../src/shared/storage/s3-storage.service.js";

const VALID_MERCHANT_ID = "a0000000-0000-0000-0000-000000000001";

// Mock @aws-sdk/s3-request-presigner
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://liveorder-covers.s3.ap-southeast-1.amazonaws.com/presigned-put-url"),
}));

describe("POST /api/uploads/livestream-cover/presign - API Tests", () => {
  let mockS3Service: S3StorageService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockS3Service = new S3StorageService({
      region: "ap-southeast-1",
      bucketName: "liveorder-covers",
    });
    app = createApp(undefined, mockS3Service);
  });

  it("TC-UP-001 - Presign valid JPEG image -> HTTP 200", async () => {
    const res = await request(app)
      .post("/api/uploads/livestream-cover/presign")
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        fileName: "cover.jpg",
        contentType: "image/jpeg",
        fileSize: 1024 * 500, // 500 KB
      });

    expect(res.status).toBe(200);
    expect(res.body.uploadUrl).toBeDefined();
    expect(res.body.objectKey).toMatch(/^livestreams\/covers\/[0-9a-f-]+\.jpg$/);
    expect(res.body.coverImageUrl).toBeUndefined();
    expect(res.body.expiresIn).toBe(300);
  });

  it("TC-UP-002 - Presign valid PNG image -> HTTP 200", async () => {
    const res = await request(app)
      .post("/api/uploads/livestream-cover/presign")
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        fileName: "banner.png",
        contentType: "image/png",
        fileSize: 1024 * 1024 * 2, // 2 MB
      });

    expect(res.status).toBe(200);
    expect(res.body.objectKey).toMatch(/^livestreams\/covers\/[0-9a-f-]+\.png$/);
  });

  it("TC-UP-003 - Presign valid WebP image -> HTTP 200", async () => {
    const res = await request(app)
      .post("/api/uploads/livestream-cover/presign")
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        fileName: "cover.webp",
        contentType: "image/webp",
        fileSize: 1024 * 300, // 300 KB
      });

    expect(res.status).toBe(200);
    expect(res.body.objectKey).toMatch(/^livestreams\/covers\/[0-9a-f-]+\.webp$/);
  });

  it("TC-UP-004 - Reject unsupported MIME type (image/gif) -> HTTP 400", async () => {
    const res = await request(app)
      .post("/api/uploads/livestream-cover/presign")
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        fileName: "animated.gif",
        contentType: "image/gif",
        fileSize: 1024 * 100,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
    expect(res.body.message).toContain("Invalid contentType");
  });

  it("TC-UP-005 - Reject unsupported MIME type (application/pdf) -> HTTP 400", async () => {
    const res = await request(app)
      .post("/api/uploads/livestream-cover/presign")
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        fileName: "document.pdf",
        contentType: "application/pdf",
        fileSize: 1024 * 100,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("TC-UP-006 - Reject file size exceeding 5MB -> HTTP 400", async () => {
    const res = await request(app)
      .post("/api/uploads/livestream-cover/presign")
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        fileName: "large.jpg",
        contentType: "image/jpeg",
        fileSize: 5 * 1024 * 1024 + 1, // 5MB + 1 byte
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
    expect(res.body.message).toContain("cannot exceed 5MB");
  });

  it("TC-UP-007 - Reject file size zero or negative -> HTTP 400", async () => {
    const res = await request(app)
      .post("/api/uploads/livestream-cover/presign")
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        fileName: "empty.jpg",
        contentType: "image/jpeg",
        fileSize: 0,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("TC-UP-008 - Reject missing fileName -> HTTP 400", async () => {
    const res = await request(app)
      .post("/api/uploads/livestream-cover/presign")
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        contentType: "image/jpeg",
        fileSize: 1024,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("TC-UP-009 - Missing X-Merchant-Id header -> HTTP 400", async () => {
    const res = await request(app)
      .post("/api/uploads/livestream-cover/presign")
      .send({
        fileName: "cover.jpg",
        contentType: "image/jpeg",
        fileSize: 1024,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("BadRequest");
    expect(res.body.message).toContain("X-Merchant-Id header is required");
  });

  it("TC-UP-010 - Handle unconfigured S3 storage gracefully -> HTTP 500 ConfigurationError", async () => {
    const unconfiguredService = new S3StorageService({});
    const unconfiguredApp = createApp(undefined, unconfiguredService);

    const res = await request(unconfiguredApp)
      .post("/api/uploads/livestream-cover/presign")
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        fileName: "cover.jpg",
        contentType: "image/jpeg",
        fileSize: 1024,
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("ConfigurationError");
    expect(res.body.message).toContain("AWS S3 storage is not configured");
  });

  it("TC-UP-011 - Handle unexpected S3 error -> HTTP 500 InternalServerError", async () => {
    vi.spyOn(mockS3Service, "createPresignedCoverUpload").mockRejectedValueOnce(
      new Error("AWS STS token expired or connection failed")
    );

    const res = await request(app)
      .post("/api/uploads/livestream-cover/presign")
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        fileName: "cover.jpg",
        contentType: "image/jpeg",
        fileSize: 1024,
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("InternalServerError");
    expect(res.body.message).toBe("Failed to generate presigned upload URL");
  });

  it("TC-UP-012 - Reject unexpected extra fields -> HTTP 400", async () => {
    const res = await request(app)
      .post("/api/uploads/livestream-cover/presign")
      .set("X-Merchant-Id", VALID_MERCHANT_ID)
      .send({
        fileName: "cover.jpg",
        contentType: "image/jpeg",
        fileSize: 1024,
        extraField: "not allowed",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });
});
