import { describe, expect, it, vi } from "vitest";
import { S3StorageService } from "../../../src/shared/storage/s3-storage.service.js";

// Mock @aws-sdk/s3-request-presigner
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://test-bucket.s3.ap-southeast-1.amazonaws.com/presigned-put-url"),
}));

describe("S3StorageService Unit Tests", () => {
  it("should detect when S3 storage is not configured", () => {
    const unconfiguredService = new S3StorageService({});
    expect(unconfiguredService.isConfigured()).toBe(false);

    const missingRegionService = new S3StorageService({ bucketName: "my-bucket" });
    expect(missingRegionService.isConfigured()).toBe(false);

    const missingBucketService = new S3StorageService({ region: "ap-southeast-1" });
    expect(missingBucketService.isConfigured()).toBe(false);
  });

  it("should detect when S3 storage is configured", () => {
    const configuredService = new S3StorageService({
      region: "ap-southeast-1",
      bucketName: "my-bucket",
    });
    expect(configuredService.isConfigured()).toBe(true);
  });

  it("should throw a clear error when creating presigned upload if not configured", async () => {
    const unconfiguredService = new S3StorageService({});
    await expect(
      unconfiguredService.createPresignedCoverUpload("image/webp", 1024)
    ).rejects.toThrow("AWS S3 storage is not configured");
  });

  it("should generate object keys with correct prefix and extension for JPEG", () => {
    const service = new S3StorageService({
      region: "ap-southeast-1",
      bucketName: "liveorder-covers",
    });
    const key = service.generateObjectKey("image/jpeg");
    expect(key).toMatch(/^public\/livestreams\/covers\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/);
  });

  it("should generate object keys with correct extension for PNG", () => {
    const service = new S3StorageService({
      region: "ap-southeast-1",
      bucketName: "liveorder-covers",
    });
    const key = service.generateObjectKey("image/png");
    expect(key).toMatch(/^public\/livestreams\/covers\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/);
  });

  it("should generate object keys with correct extension for WebP", () => {
    const service = new S3StorageService({
      region: "ap-southeast-1",
      bucketName: "liveorder-covers",
    });
    const key = service.generateObjectKey("image/webp");
    expect(key).toMatch(/^public\/livestreams\/covers\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/);
  });

  it("should support custom S3Client instance", () => {
    const fakeClient = {} as any;
    const service = new S3StorageService({ bucketName: "my-bucket" }, fakeClient);
    expect(service.isConfigured()).toBe(true);
  });

  it("should generate object key with 'bin' extension for unknown MIME type", () => {
    const service = new S3StorageService({
      region: "ap-southeast-1",
      bucketName: "liveorder-covers",
    });
    const key = service.generateObjectKey("application/octet-stream");
    expect(key).toMatch(/^public\/livestreams\/covers\/[0-9a-f-]+\.bin$/);
  });

  it("should create presigned upload result with uploadUrl, objectKey, and expiresIn (no public coverImageUrl)", async () => {
    const service = new S3StorageService({
      region: "ap-southeast-1",
      bucketName: "liveorder-covers",
    });
    const result = await service.createPresignedCoverUpload("image/webp", 2048);

    expect(result.uploadUrl).toBe(
      "https://test-bucket.s3.ap-southeast-1.amazonaws.com/presigned-put-url"
    );
    expect(result.objectKey).toMatch(/^public\/livestreams\/covers\/[0-9a-f-]+\.webp$/);
    expect(result.expiresIn).toBe(300);
    expect((result as any).coverImageUrl).toBeUndefined();
  });

  it("should generate presigned download GET URL for private objects", async () => {
    const service = new S3StorageService({
      region: "ap-southeast-1",
      bucketName: "liveorder-covers",
    });
    const downloadUrl = await service.getPresignedDownloadUrl(
      "livestreams/covers/test.webp",
      600
    );

    expect(downloadUrl).toBe(
      "https://test-bucket.s3.ap-southeast-1.amazonaws.com/presigned-put-url"
    );
  });

  it("should throw error when getPresignedDownloadUrl called on unconfigured service", async () => {
    const unconfiguredService = new S3StorageService({});
    await expect(
      unconfiguredService.getPresignedDownloadUrl("livestreams/covers/test.webp")
    ).rejects.toThrow("AWS S3 storage is not configured");
  });
});
