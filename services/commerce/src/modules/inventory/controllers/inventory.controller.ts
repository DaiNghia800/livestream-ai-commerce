import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  AdjustInventorySchema,
  AdjustmentDraftQuerySchema,
  AdjustmentListQuerySchema,
  BatchAdjustInventorySchema,
  InventoryListQuerySchema,
  SaveAdjustmentDraftSchema,
  StockHoldSchema,
  UpdateThresholdSchema,
} from "../schemas/inventory.schema.js";
import {
  AdjustmentDocumentNotFoundError,
  InsufficientStockError,
  InventorySkuNotFoundError,
} from "../repositories/inventory.repository.js";
import { InventoryNotFoundError, InventoryService } from "../services/inventory.service.js";
import { InventorySpreadsheetService } from "../services/inventory-spreadsheet.service.js";

export class InventoryController {
  private readonly spreadsheet: InventorySpreadsheetService;

  constructor(private readonly service: InventoryService) {
    this.spreadsheet = new InventorySpreadsheetService(service);
  }

  getAdjustmentDraft = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = AdjustmentDraftQuerySchema.parse(req.query);
      res
        .status(200)
        .json({ data: await this.service.getAdjustmentDraft(req.shopId!, query.productId) });
    } catch (error) {
      this.handleError(error, res, "Failed to fetch adjustment draft");
    }
  };

  saveAdjustmentDraft = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = SaveAdjustmentDraftSchema.parse(req.body);
      res
        .status(200)
        .json({ data: await this.service.saveAdjustmentDraft(req.shopId!, input, req.userId) });
    } catch (error) {
      this.handleError(error, res, "Failed to save adjustment draft");
    }
  };

  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = InventoryListQuerySchema.parse(req.query);
      res.status(200).json(await this.service.list(req.shopId!, query));
    } catch (error) {
      this.handleError(error, res, "Failed to fetch inventory");
    }
  };

  summary = async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(200).json(await this.service.getSummary(req.shopId!));
    } catch (error) {
      this.handleError(error, res, "Failed to fetch inventory summary");
    }
  };

  getBySku = async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(200).json(await this.service.getBySku(req.shopId!, req.params.skuId));
    } catch (error) {
      this.handleError(error, res, "Failed to fetch inventory item");
    }
  };

  adjust = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = AdjustInventorySchema.parse(req.body);
      const result = await this.service.adjust(
        req.shopId!,
        req.params.skuId,
        input,
        req.userId
      );
      res.status(200).json(result);
    } catch (error) {
      this.handleError(error, res, "Failed to adjust inventory");
    }
  };

  adjustMany = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = BatchAdjustInventorySchema.parse(req.body);
      const results = await this.service.adjustMany(req.shopId!, input, req.userId);
      res.status(200).json({ data: results });
    } catch (error) {
      this.handleError(error, res, "Failed to adjust inventory");
    }
  };

  setThreshold = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = UpdateThresholdSchema.parse(req.body);
      res
        .status(200)
        .json(await this.service.setThreshold(req.shopId!, req.params.skuId, input.lowStockThreshold));
    } catch (error) {
      this.handleError(error, res, "Failed to update low-stock threshold");
    }
  };

  reserve = this.holdHandler("reserve", "Failed to reserve stock");
  release = this.holdHandler("release", "Failed to release stock");
  consume = this.holdHandler("consume", "Failed to consume stock");

  listAdjustments = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = AdjustmentListQuerySchema.parse(req.query);
      res.status(200).json(await this.service.listAdjustments(req.shopId!, query));
    } catch (error) {
      this.handleError(error, res, "Failed to fetch inventory history");
    }
  };

  exportInventory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page: _page, pageSize: _pageSize, ...filters } = InventoryListQuerySchema.parse(
        req.query
      );
      const { buffer } = await this.spreadsheet.exportInventory(req.shopId!, filters);
      res
        .status(200)
        .set(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .set("Content-Disposition", 'attachment; filename="kiem-ke-ton-kho.xlsx"')
        .send(buffer);
    } catch (error) {
      this.handleError(error, res, "Failed to export inventory");
    }
  };

  exportAdjustments = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page: _page, pageSize: _pageSize, ...filters } = AdjustmentListQuerySchema.parse(
        req.query
      );
      const { buffer } = await this.spreadsheet.exportAdjustments(req.shopId!, filters);
      res
        .status(200)
        .set(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .set("Content-Disposition", 'attachment; filename="nhat-ky-ton-kho.xlsx"')
        .send(buffer);
    } catch (error) {
      this.handleError(error, res, "Failed to export inventory history");
    }
  };

  private holdHandler(action: "reserve" | "release" | "consume", fallback: string) {
    return async (req: Request, res: Response): Promise<void> => {
      try {
        const input = StockHoldSchema.parse(req.body);
        const result = await this.service[action](
          req.shopId!,
          req.params.skuId,
          input,
          req.userId
        );
        res.status(200).json(result);
      } catch (error) {
        this.handleError(error, res, fallback);
      }
    };
  }

  private handleError(error: unknown, res: Response, fallbackMessage: string): void {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "ValidationError",
        message: "Invalid request",
        details: error.flatten(),
      });
      return;
    }
    if (
      error instanceof InventoryNotFoundError ||
      error instanceof InventorySkuNotFoundError ||
      error instanceof AdjustmentDocumentNotFoundError
    ) {
      res.status(404).json({ error: "NotFound", message: error.message });
      return;
    }
    if (error instanceof InsufficientStockError) {
      res.status(409).json({ error: "InsufficientStock", message: error.message });
      return;
    }
    console.error(`[InventoryController] ${fallbackMessage}:`, error);
    res.status(500).json({ error: "InternalServerError", message: fallbackMessage });
  }
}
