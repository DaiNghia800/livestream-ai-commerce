import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

interface PendingUpload {
  contentType: string;
  fileSize: number;
  expiresAt: number;
}

export interface LocalProductImageUpload {
  uploadUrl: string;
  imageUrl: string;
  objectKey: string;
}

export class LocalProductImageStorageService {
  private readonly pendingUploads = new Map<string, PendingUpload>();

  constructor(
    private readonly directory: string,
    private readonly publicBaseUrl: string
  ) {}

  getDirectory(): string {
    return this.directory;
  }

  createUpload(contentType: string, fileSize: number): LocalProductImageUpload {
    const extension = MIME_EXTENSION_MAP[contentType];
    if (!extension) throw new Error("Unsupported product image type");

    const objectKey = `${randomUUID()}.${extension}`;
    this.pendingUploads.set(objectKey, {
      contentType,
      fileSize,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    for (const [key, upload] of this.pendingUploads) {
      if (upload.expiresAt <= Date.now()) this.pendingUploads.delete(key);
    }

    const baseUrl = this.publicBaseUrl.replace(/\/+$/, "");
    return {
      uploadUrl: `${baseUrl}/api/uploads/product-image/${objectKey}`,
      imageUrl: `${baseUrl}/uploads/products/${objectKey}`,
      objectKey,
    };
  }

  async saveUpload(
    objectKey: string,
    contentType: string,
    body: Buffer
  ): Promise<void> {
    const pending = this.pendingUploads.get(objectKey);
    if (!pending || pending.expiresAt <= Date.now()) {
      this.pendingUploads.delete(objectKey);
      throw new Error("Upload URL is invalid or expired");
    }
    if (pending.contentType !== contentType || pending.fileSize !== body.byteLength) {
      throw new Error("Uploaded image does not match the requested content type or file size");
    }

    this.pendingUploads.delete(objectKey);
    await mkdir(this.directory, { recursive: true });
    await writeFile(path.join(this.directory, objectKey), body, { flag: "wx" });
  }
}
