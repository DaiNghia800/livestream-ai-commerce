import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

export interface S3StorageConfig {
  region?: string;
  bucketName?: string;
  publicBaseUrl?: string;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
}

export interface PresignedProductImageUploadResult extends PresignedUploadResult {
  imageUrl: string;
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class S3StorageService {
  private s3Client: S3Client | null = null;

  constructor(
    private readonly config: S3StorageConfig,
    customClient?: S3Client
  ) {
    if (customClient) {
      this.s3Client = customClient;
    } else if (config.region) {
      // Default AWS credential provider chain
      this.s3Client = new S3Client({ region: config.region });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.config.bucketName && (this.config.region || this.s3Client));
  }

  generateObjectKey(contentType: string, prefix = "livestreams/covers"): string {
    const ext = MIME_EXTENSION_MAP[contentType] || "bin";
    const uuid = crypto.randomUUID();
    return `${prefix}/${uuid}.${ext}`;
  }

  async createPresignedCoverUpload(
    contentType: string,
    fileSize: number
  ): Promise<PresignedUploadResult> {
    return this.createPresignedUpload(contentType, fileSize, "livestreams/covers");
  }

  async createPresignedProductImageUpload(
    contentType: string,
    fileSize: number
  ): Promise<PresignedProductImageUploadResult> {
    const result = await this.createPresignedUpload(contentType, fileSize, "products/images");
    const publicBaseUrl = this.config.publicBaseUrl?.replace(/\/+$/, "");
    const imageUrl = publicBaseUrl
      ? `${publicBaseUrl}/${result.objectKey}`
      : result.uploadUrl.split("?")[0];
    return { ...result, imageUrl };
  }

  private async createPresignedUpload(
    contentType: string,
    fileSize: number,
    prefix: string
  ): Promise<PresignedUploadResult> {
    if (!this.isConfigured()) {
      throw new Error(
        "AWS S3 storage is not configured. Missing S3_BUCKET_NAME or AWS_REGION."
      );
    }

    const objectKey = this.generateObjectKey(contentType, prefix);
    const expiresIn = 300; // 5 minutes

    const client = this.s3Client!;

    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: objectKey,
      ContentType: contentType,
      ContentLength: fileSize,
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn });

    return {
      uploadUrl,
      objectKey,
      expiresIn,
    };
  }

  /**
   * Helper method for generating presigned GET URLs for private bucket objects.
   * Can be used when image delivery requires short-lived presigned URLs.
   */
  async getPresignedDownloadUrl(
    objectKey: string,
    expiresIn = 3600
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error(
        "AWS S3 storage is not configured. Missing S3_BUCKET_NAME or AWS_REGION."
      );
    }

    const client = this.s3Client!;

    const command = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: objectKey,
    });

    return getSignedUrl(client, command, { expiresIn });
  }
}
