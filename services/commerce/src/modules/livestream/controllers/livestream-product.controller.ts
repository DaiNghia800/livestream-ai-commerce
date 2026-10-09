import { Request, Response } from "express";
import { ZodError } from "zod";
import { isValidUuid } from "../../../shared/utils/uuid.util.js";
import {
  AddLivestreamProductSchema,
  UpdateLivestreamProductSchema,
} from "../schemas/livestream-product.schema.js";
import {
  LivestreamProductService,
  LivestreamNotFoundError,
  ForbiddenMerchantError,
  InvalidLivestreamStatusError,
  DuplicateProductError,
  ProductNotInLivestreamError,
} from "../services/livestream-product.service.js";

export class LivestreamProductController {
  constructor(private readonly service: LivestreamProductService) {}

  addProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id: livestreamId } = req.params;
      if (!isValidUuid(livestreamId)) {
        res.status(400).json({
          error: "ValidationError",
          message: "Invalid livestream ID format (must be UUID)",
        });
        return;
      }

      const input = AddLivestreamProductSchema.parse(req.body);
      const merchantId = req.merchantId!;

      const item = await this.service.addProduct(merchantId, livestreamId, input);
      res.status(201).json(item);
    } catch (err) {
      this.handleError(err, res, "Failed to add product to livestream");
    }
  };

  getProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id: livestreamId } = req.params;
      if (!isValidUuid(livestreamId)) {
        res.status(400).json({
          error: "ValidationError",
          message: "Invalid livestream ID format (must be UUID)",
        });
        return;
      }

      const products = await this.service.getProducts(livestreamId);
      res.status(200).json({
        data: products,
        total: products.length,
      });
    } catch (err) {
      this.handleError(err, res, "Failed to fetch livestream products");
    }
  };

  updateProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id: livestreamId, productId } = req.params;
      if (!isValidUuid(livestreamId)) {
        res.status(400).json({
          error: "ValidationError",
          message: "Invalid livestream ID format (must be UUID)",
        });
        return;
      }
      if (!isValidUuid(productId)) {
        res.status(400).json({
          error: "ValidationError",
          message: "Invalid product ID format (must be UUID)",
        });
        return;
      }

      const input = UpdateLivestreamProductSchema.parse(req.body);
      const merchantId = req.merchantId!;

      const updated = await this.service.updateProduct(
        merchantId,
        livestreamId,
        productId,
        input
      );
      res.status(200).json(updated);
    } catch (err) {
      this.handleError(err, res, "Failed to update livestream product");
    }
  };

  removeProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id: livestreamId, productId } = req.params;
      if (!isValidUuid(livestreamId)) {
        res.status(400).json({
          error: "ValidationError",
          message: "Invalid livestream ID format (must be UUID)",
        });
        return;
      }
      if (!isValidUuid(productId)) {
        res.status(400).json({
          error: "ValidationError",
          message: "Invalid product ID format (must be UUID)",
        });
        return;
      }

      const merchantId = req.merchantId!;
      await this.service.removeProduct(merchantId, livestreamId, productId);
      res.status(200).json({
        message: "Product removed from livestream successfully",
      });
    } catch (err) {
      this.handleError(err, res, "Failed to remove product from livestream");
    }
  };

  private handleError(err: unknown, res: Response, fallbackMessage: string): void {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: "ValidationError",
        message: err.errors.map((e) => e.message).join("; "),
        details: err.errors,
      });
      return;
    }

    if (err instanceof LivestreamNotFoundError) {
      res.status(404).json({
        error: "NotFoundError",
        message: err.message,
      });
      return;
    }

    if (err instanceof ProductNotInLivestreamError) {
      res.status(404).json({
        error: "NotFoundError",
        message: err.message,
      });
      return;
    }

    if (err instanceof ForbiddenMerchantError) {
      res.status(403).json({
        error: "ForbiddenError",
        message: err.message,
      });
      return;
    }

    if (err instanceof DuplicateProductError) {
      res.status(409).json({
        error: "ConflictError",
        message: err.message,
      });
      return;
    }

    if (err instanceof InvalidLivestreamStatusError) {
      res.status(400).json({
        error: "BadRequest",
        message: err.message,
      });
      return;
    }

    console.error(`[LivestreamProductController] ${fallbackMessage}:`, err);
    res.status(500).json({
      error: "InternalServerError",
      message: fallbackMessage,
    });
  }
}
