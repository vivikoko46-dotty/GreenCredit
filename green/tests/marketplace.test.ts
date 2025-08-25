import { describe, expect, it, beforeEach } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("Marketplace Contract Tests", () => {
  beforeEach(() => {
    simnet.setEpoch("3.0");
  });

  describe("Order Management", () => {
    it("should initialize with correct default values", () => {
      const { result } = simnet.callReadOnlyFn("marketplace", "get-marketplace-stats", [], deployer);
      expect(result).toBeOk();
      const stats = result.value;
      expect(stats).toHaveProperty("total-orders", "u0");
      expect(stats).toHaveProperty("marketplace-fee-rate", "u100");
      expect(stats).toHaveProperty("contract-paused", false);
    });

    it("should create a buy order", () => {
      const { result } = simnet.callPublicFn(
        "marketplace",
        "create-buy-order",
        [
          "u1", // credit-type (renewable energy)
          "u100", // amount
          "u50000000", // price-per-ton (50 STX)
          "u1500" // expires-at (future block)
        ],
        wallet1
      );
      expect(result).toBeOk();
      expect(result.value).toBe("u1");
    });

    it("should create a sell order", () => {
      const { result } = simnet.callPublicFn(
        "marketplace",
        "create-sell-order",
        [
          "u2", // credit-type (forest conservation)
          "u200", // amount
          "u45000000", // price-per-ton (45 STX)
          "u1500" // expires-at
        ],
        wallet2
      );
      expect(result).toBeOk();
      expect(result.value).toBe("u1");
    });

    it("should fail to create order with invalid amount", () => {
      const { result } = simnet.callPublicFn(
        "marketplace",
        "create-buy-order",
        [
          "u1",
          "u0", // Invalid amount
          "u50000000",
          "u1500"
        ],
        wallet1
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u204"); // ERR_INVALID_AMOUNT
    });

    it("should fail to create order with invalid price", () => {
      const { result } = simnet.callPublicFn(
        "marketplace",
        "create-sell-order",
        [
          "u1",
          "u100",
          "u0", // Invalid price
          "u1500"
        ],
        wallet1
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u203"); // ERR_INVALID_PRICE
    });

    it("should fail to create order with past expiration", () => {
      const { result } = simnet.callPublicFn(
        "marketplace",
        "create-buy-order",
        [
          "u1",
          "u100",
          "u50000000",
          "u1" // Past block height
        ],
        wallet1
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u205"); // ERR_ORDER_EXPIRED
    });

    it("should cancel an order", () => {
      // First create an order
      simnet.callPublicFn(
        "marketplace",
        "create-buy-order",
        ["u1", "u100", "u50000000", "u1500"],
        wallet1
      );

      // Then cancel it
      const { result } = simnet.callPublicFn(
        "marketplace",
        "cancel-order",
        ["u1"],
        wallet1
      );
      expect(result).toBeOk();
    });

    it("should fail to cancel order from different user", () => {
      // Create order with wallet1
      simnet.callPublicFn(
        "marketplace",
        "create-buy-order",
        ["u1", "u100", "u50000000", "u1500"],
        wallet1
      );

      // Try to cancel with wallet2
      const { result } = simnet.callPublicFn(
        "marketplace",
        "cancel-order",
        ["u1"],
        wallet2
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u200"); // ERR_NOT_AUTHORIZED
    });

    it("should retrieve order details", () => {
      // Create an order
      simnet.callPublicFn(
        "marketplace",
        "create-buy-order",
        ["u1", "u100", "u50000000", "u1500"],
        wallet1
      );

      // Get order details
      const { result } = simnet.callReadOnlyFn("marketplace", "get-order", ["u1"], deployer);
      expect(result).toBeSome();
      const order = result.value;
      expect(order).toHaveProperty("trader", wallet1);
      expect(order).toHaveProperty("order-type", "u1"); // ORDER_TYPE_BUY
      expect(order).toHaveProperty("amount", "u100");
      expect(order).toHaveProperty("is-active", true);
    });

    it("should retrieve user orders", () => {
      // Create multiple orders
      simnet.callPublicFn(
        "marketplace",
        "create-buy-order",
        ["u1", "u100", "u50000000", "u1500"],
        wallet1
      );
      simnet.callPublicFn(
        "marketplace",
        "create-sell-order",
        ["u2", "u200", "u45000000", "u1500"],
        wallet1
      );

      // Get user orders
      const { result } = simnet.callReadOnlyFn("marketplace", "get-user-orders", [wallet1], deployer);
      expect(result).toBeList();
      expect(result.value.length).toBe(2);
    });

    it("should retrieve order book", () => {
      // Create orders of different types
      simnet.callPublicFn(
        "marketplace",
        "create-buy-order",
        ["u1", "u100", "u50000000", "u1500"],
        wallet1
      );
      simnet.callPublicFn(
        "marketplace",
        "create-buy-order",
        ["u1", "u150", "u48000000", "u1500"],
        wallet2
      );

      // Get buy order book for credit type 1
      const { result } = simnet.callReadOnlyFn(
        "marketplace", 
        "get-order-book", 
        ["u1", "u1"], // credit-type, order-type (buy)
        deployer
      );
      expect(result).toBeList();
      expect(result.value.length).toBe(2);
    });
  });

  describe("Admin Functions", () => {
    it("should allow owner to pause contract", () => {
      const { result } = simnet.callPublicFn(
        "marketplace",
        "set-contract-paused",
        [true],
        deployer
      );
      expect(result).toBeOk();

      // Verify contract is paused
      const statsResult = simnet.callReadOnlyFn("marketplace", "get-marketplace-stats", [], deployer);
      expect(statsResult.value).toHaveProperty("contract-paused", true);
    });

    it("should fail to pause contract from non-owner", () => {
      const { result } = simnet.callPublicFn(
        "marketplace",
        "set-contract-paused",
        [true],
        wallet1
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u200"); // ERR_NOT_AUTHORIZED
    });

    it("should prevent order creation when paused", () => {
      // Pause the contract
      simnet.callPublicFn("marketplace", "set-contract-paused", [true], deployer);

      // Try to create order
      const { result } = simnet.callPublicFn(
        "marketplace",
        "create-buy-order",
        ["u1", "u100", "u50000000", "u1500"],
        wallet1
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u207"); // ERR_CONTRACT_PAUSED
    });
  });

  describe("Order Book Management", () => {
    it("should maintain separate order books by credit type", () => {
      // Create orders for different credit types
      simnet.callPublicFn(
        "marketplace",
        "create-buy-order",
        ["u1", "u100", "u50000000", "u1500"], // Renewable energy
        wallet1
      );
      simnet.callPublicFn(
        "marketplace",
        "create-buy-order",
        ["u2", "u200", "u45000000", "u1500"], // Forest conservation
        wallet2
      );

      // Check order book for type 1
      const type1Result = simnet.callReadOnlyFn(
        "marketplace",
        "get-order-book",
        ["u1", "u1"],
        deployer
      );
      expect(type1Result.value.length).toBe(1);

      // Check order book for type 2
      const type2Result = simnet.callReadOnlyFn(
        "marketplace",
        "get-order-book",
        ["u2", "u1"],
        deployer
      );
      expect(type2Result.value.length).toBe(1);
    });

    it("should maintain separate buy and sell order books", () => {
      // Create buy and sell orders for same credit type
      simnet.callPublicFn(
        "marketplace",
        "create-buy-order",
        ["u1", "u100", "u50000000", "u1500"],
        wallet1
      );
      simnet.callPublicFn(
        "marketplace",
        "create-sell-order",
        ["u1", "u150", "u52000000", "u1500"],
        wallet2
      );

      // Check buy order book
      const buyResult = simnet.callReadOnlyFn(
        "marketplace",
        "get-order-book",
        ["u1", "u1"], // credit-type 1, buy orders
        deployer
      );
      expect(buyResult.value.length).toBe(1);

      // Check sell order book
      const sellResult = simnet.callReadOnlyFn(
        "marketplace",
        "get-order-book",
        ["u1", "u2"], // credit-type 1, sell orders
        deployer
      );
      expect(sellResult.value.length).toBe(1);
    });
  });
});
