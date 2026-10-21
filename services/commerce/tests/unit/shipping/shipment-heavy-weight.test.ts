import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { GhnHeavyShipmentNotSupportedError } from "../../../src/modules/shipping/errors/shipping.errors.js";
import { ShipmentService } from "../../../src/modules/shipping/services/shipment.service.js";

vi.mock("../../../src/modules/shipping/carriers/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/modules/shipping/carriers/index.js")>()),
  getCarrier: (name?: string) => ({ name: name ?? "ghn" }),
}));

function service() {
  const connect = vi.fn().mockRejectedValue(new Error("database reached"));
  return {
    shipment: new ShipmentService({ connect } as unknown as Pool),
    connect,
  };
}

const orderId = "00000000-0000-4000-8000-000000000001";

describe("GHN heavy shipment validation", () => {
  it("blocks 20 kg with the default GHN carrier before writing a shipment", async () => {
    const { shipment, connect } = service();

    await expect(
      shipment.createShipment({ orderId, weightGram: 20000 })
    ).rejects.toBeInstanceOf(GhnHeavyShipmentNotSupportedError);
    expect(connect).not.toHaveBeenCalled();
  });

  it("also blocks an explicitly selected heavy service below 20 kg", async () => {
    const { shipment, connect } = service();

    await expect(
      shipment.createShipment({
        orderId,
        carrier: "ghn",
        serviceCode: "05",
        weightGram: 500,
      })
    ).rejects.toBeInstanceOf(GhnHeavyShipmentNotSupportedError);
    expect(connect).not.toHaveBeenCalled();
  });

  it("keeps 19,999 g and other carriers available for normal processing", async () => {
    const { shipment, connect } = service();

    await expect(
      shipment.createShipment({ orderId, carrier: "ghn", weightGram: 19999 })
    ).rejects.toThrow("database reached");
    await expect(
      shipment.createShipment({ orderId, carrier: "self", weightGram: 50000 })
    ).rejects.toThrow("database reached");
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
