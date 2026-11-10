import { describe, expect, it } from "vitest";
import { InMemoryLivestreamRepository } from "../../../src/modules/livestream/repositories/livestream.repository.js";
import { createLivestreamRouter } from "../../../src/modules/livestream/routes/livestream.routes.js";

describe("createLivestreamRouter - Unit Tests", () => {
  it("ROUTE-001 - initializes router with default PostgresLivestreamRepository when no repository is passed", () => {
    const router = createLivestreamRouter();

    expect(router).toBeDefined();
    // Express Router stack has layers for defined routes
    const postRoute = router.stack.find(
      (layer: any) => layer.route && layer.route.path === "/" && layer.route.methods.post
    );
    expect(postRoute).toBeDefined();
  });

  it("ROUTE-002 - initializes router with provided custom repository", () => {
    const customRepo = new InMemoryLivestreamRepository();
    const router = createLivestreamRouter(customRepo);

    expect(router).toBeDefined();
    const postRoute = router.stack.find(
      (layer: any) => layer.route && layer.route.path === "/" && layer.route.methods.post
    );
    expect(postRoute).toBeDefined();
  });

  it("ROUTE-003 - initializes router with custom and default AWS services coverage", () => {
    // Truyền custom repository, productRepository, commentRepository và kiểm tra khởi tạo đầy đủ
    const router = createLivestreamRouter(
      new InMemoryLivestreamRepository(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    );

    expect(router).toBeDefined();
    const patchRoute = router.stack.find(
      (layer: any) => layer.route && layer.route.path === "/:id" && layer.route.methods.patch
    );
    expect(patchRoute).toBeDefined();
  });

  it("ROUTE-004 - initializes router with all custom services explicitly passed", () => {
    const mockRepo: any = {};
    const mockProductRepo: any = {};
    const mockCommentRepo: any = {};
    const mockIvs: any = {};
    const mockIvsChat: any = {};
    const mockSqs: any = {};

    const router = createLivestreamRouter(
      mockRepo,
      mockProductRepo,
      mockCommentRepo,
      mockIvs,
      mockIvsChat,
      mockSqs
    );

    expect(router).toBeDefined();
  });
});

describe("createUploadRouter - Unit Tests", () => {
  it("UPLOAD-ROUTE-001 - initializes upload router with default S3 and local storage services", async () => {
    const { createUploadRouter } = await import(
      "../../../src/modules/livestream/routes/upload.routes.js"
    );

    const router = createUploadRouter();
    expect(router).toBeDefined();

    const presignCoverRoute = router.stack.find(
      (layer: any) =>
        layer.route &&
        layer.route.path === "/livestream-cover/presign" &&
        layer.route.methods.post
    );
    expect(presignCoverRoute).toBeDefined();

    const presignProductRoute = router.stack.find(
      (layer: any) =>
        layer.route &&
        layer.route.path === "/product-image/presign" &&
        layer.route.methods.post
    );
    expect(presignProductRoute).toBeDefined();

    const uploadLocalRoute = router.stack.find(
      (layer: any) =>
        layer.route &&
        layer.route.path === "/product-image/:fileName" &&
        layer.route.methods.put
    );
    expect(uploadLocalRoute).toBeDefined();
  });

  it("UPLOAD-ROUTE-002 - initializes upload router with custom storage services", async () => {
    const { createUploadRouter } = await import(
      "../../../src/modules/livestream/routes/upload.routes.js"
    );

    const mockS3: any = {};
    const mockLocal: any = {};

    const router = createUploadRouter(mockS3, mockLocal);
    expect(router).toBeDefined();
  });
});
