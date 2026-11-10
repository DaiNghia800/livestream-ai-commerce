import { Request, Response, NextFunction } from "express";
import { isValidUuid } from "../utils/uuid.util.js";

// Augment express Request to include merchantId
declare global {
  namespace Express {
    interface Request {
      merchantId?: string;
    }
  }
}

/**
 * Middleware to extract merchantId from the X-Merchant-Id header.
 *
 * TODO: Replace X-Merchant-Id with authenticated JWT merchant claim
 * when Identity/Auth integration is ready.
 */
export function requireMerchantHeader(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const merchantHeader = req.header("X-Merchant-Id");

  if (!merchantHeader) {
    res.status(400).json({
      error: "BadRequest",
      message: "X-Merchant-Id header is required",
    });
    return;
  }

  if (!isValidUuid(merchantHeader)) {
    res.status(400).json({
      error: "BadRequest",
      message: "Invalid X-Merchant-Id header format. Must be a valid UUID.",
    });
    return;
  }

  req.merchantId = merchantHeader;
  next();
}
