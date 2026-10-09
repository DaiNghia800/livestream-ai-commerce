import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  CreateProductSchema,
  CreateProductSkuSchema,
  ProductListQuerySchema,
  UpdateProductSchema,
  UpdateProductSkuSchema,
} from "../schemas/product.schema.js";
import {
  DuplicateProductCodeError,
  DuplicateSkuCodeError,
  InvalidProductReferenceError,
} from "../repositories/product.repository.js";
import { ProductNotFoundError, ProductService } from "../services/product.service.js";
import {
  InvalidProductWorkbookError,
  ProductSpreadsheetService,
} from "../services/product-spreadsheet.service.js";

export class ProductController {
  constructor(
    private readonly service: ProductService,
    private readonly spreadsheetService: ProductSpreadsheetService
  ) {}

  exportExcel = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = ProductListQuerySchema.parse(req.query);
      const buffer = await this.spreadsheetService.export(req.shopId!, {
        q: query.q,
        categoryId: query.categoryId,
        status: query.status,
      });
      res
        .status(200)
        .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .set("Content-Disposition", 'attachment; filename="products.xlsx"')
        .send(buffer);
    } catch (error) {
      this.handleError(error, res, "Failed to export products");
    }
  };

  importExcel = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!Buffer.isBuffer(req.body)) {
        throw new InvalidProductWorkbookError(
          "Gửi file .xlsx với Content-Type application/vnd.openxmlformats-officedocument.spreadsheetml.sheet."
        );
      }
      const result = await this.spreadsheetService.import(req.shopId!, req.body);
      res.status(201).json({ ...result, message: "Import sản phẩm thành công" });
    } catch (error) {
      this.handleError(error, res, "Failed to import products");
    }
  };

  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = ProductListQuerySchema.parse(req.query);
      res.status(200).json(await this.service.list(req.shopId!, query));
    } catch (error) {
      this.handleError(error, res, "Failed to fetch products");
    }
  };

  listCategories = async (_req: Request, res: Response): Promise<void> => {
    try {
      res.status(200).json({ data: await this.service.listCategories() });
    } catch (error) {
      this.handleError(error, res, "Failed to fetch product categories");
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const product = await this.service.findById(req.shopId!, req.params.id);
      res.status(200).json(product);
    } catch (error) {
      this.handleError(error, res, "Failed to fetch product");
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = CreateProductSchema.parse(req.body);
      res.status(201).json(await this.service.create(req.shopId!, input));
    } catch (error) {
      this.handleError(error, res, "Failed to create product");
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = UpdateProductSchema.parse(req.body);
      res.status(200).json(await this.service.update(req.shopId!, req.params.id, input));
    } catch (error) {
      this.handleError(error, res, "Failed to update product");
    }
  };

  archive = async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(200).json(await this.service.archive(req.shopId!, req.params.id));
    } catch (error) {
      this.handleError(error, res, "Failed to archive product");
    }
  };

  createSku = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = CreateProductSkuSchema.parse(req.body);
      res.status(201).json(await this.service.createSku(req.shopId!, req.params.id, input));
    } catch (error) {
      this.handleError(error, res, "Failed to create product SKU");
    }
  };

  updateSku = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = UpdateProductSkuSchema.parse(req.body);
      res.status(200).json(
        await this.service.updateSku(req.shopId!, req.params.id, req.params.skuId, input)
      );
    } catch (error) {
      this.handleError(error, res, "Failed to update product SKU");
    }
  };

  discontinueSku = async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(200).json(
        await this.service.discontinueSku(req.shopId!, req.params.id, req.params.skuId)
      );
    } catch (error) {
      this.handleError(error, res, "Failed to discontinue product SKU");
    }
  };

  removeImage = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.service.removeImage(req.shopId!, req.params.id, req.params.imageId);
      res.status(200).json({ message: "Product image removed" });
    } catch (error) {
      this.handleError(error, res, "Failed to remove product image");
    }
  };

  private handleError(error: unknown, res: Response, fallbackMessage: string): void {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "ValidationError",
        message: error.errors.map((issue) => issue.message).join("; "),
        details: error.errors,
      });
      return;
    }
    if (error instanceof ProductNotFoundError) {
      res.status(404).json({ error: "NotFoundError", message: error.message });
      return;
    }
    if (
      error instanceof DuplicateProductCodeError ||
      error instanceof DuplicateSkuCodeError
    ) {
      res.status(409).json({ error: "ConflictError", message: error.message });
      return;
    }
    if (error instanceof InvalidProductReferenceError) {
      res.status(400).json({ error: "ValidationError", message: error.message });
      return;
    }
    if (error instanceof InvalidProductWorkbookError) {
      res.status(400).json({ error: "ValidationError", message: error.message });
      return;
    }
    console.error(`[ProductController] ${fallbackMessage}:`, error);
    res.status(500).json({ error: "InternalServerError", message: fallbackMessage });
  }
}