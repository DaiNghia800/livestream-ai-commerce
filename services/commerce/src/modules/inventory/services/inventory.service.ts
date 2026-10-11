import type {
  AdjustInventoryInput,
  AdjustmentListQuery,
  BatchAdjustInventoryInput,
  InventoryListQuery,
  StockHoldInput,
} from "../schemas/inventory.schema.js";
import type { IInventoryRepository } from "../repositories/inventory.repository.js";
import type {
  InventoryAdjustmentPage,
  InventoryChangeResult,
  InventoryItem,
  InventoryPage,
  InventorySummary,
} from "../types/inventory.types.js";

export class InventoryNotFoundError extends Error {
  constructor() {
    super("SKU not found");
    this.name = "InventoryNotFoundError";
  }
}

export class InventoryService {
  constructor(private readonly repository: IInventoryRepository) {}

  list(shopId: number, query: InventoryListQuery): Promise<InventoryPage> {
    return this.repository.list(shopId, query);
  }

  getSummary(shopId: number): Promise<InventorySummary> {
    return this.repository.getSummary(shopId);
  }

  async getBySku(shopId: number, skuId: string): Promise<InventoryItem> {
    const item = await this.repository.findBySku(shopId, skuId);
    if (!item) throw new InventoryNotFoundError();
    return item;
  }

  adjust(shopId: number, skuId: string, input: AdjustInventoryInput, userId?: number) {
    return this.repository.adjust(shopId, skuId, input, userId);
  }

  adjustMany(
    shopId: number,
    input: BatchAdjustInventoryInput,
    userId?: number
  ): Promise<InventoryChangeResult[]> {
    return this.repository.adjustMany(shopId, input, userId);
  }

  async setThreshold(shopId: number, skuId: string, threshold: number): Promise<InventoryItem> {
    const item = await this.repository.setThreshold(shopId, skuId, threshold);
    if (!item) throw new InventoryNotFoundError();
    return item;
  }

  reserve(shopId: number, skuId: string, input: StockHoldInput, userId?: number) {
    return this.repository.reserve(shopId, skuId, input, userId);
  }

  release(shopId: number, skuId: string, input: StockHoldInput, userId?: number) {
    return this.repository.release(shopId, skuId, input, userId);
  }

  consume(shopId: number, skuId: string, input: StockHoldInput, userId?: number) {
    return this.repository.consume(shopId, skuId, input, userId);
  }

  listAdjustments(shopId: number, query: AdjustmentListQuery): Promise<InventoryAdjustmentPage> {
    return this.repository.listAdjustments(shopId, query);
  }
}
