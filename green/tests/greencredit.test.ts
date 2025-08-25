
import { describe, expect, it, beforeEach } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("GreenCredit Platform Tests", () => {
  beforeEach(() => {
    simnet.setEpoch("3.0");
  });

  describe("GreenCredit Core Contract", () => {
    it("should initialize with correct default values", () => {
      const { result } = simnet.callReadOnlyFn("greencredit", "get-platform-stats", [], deployer);
      expect(result).toBeOk();
      const stats = result.value;
      expect(stats).toHaveProperty("total-credits", "u0");
      expect(stats).toHaveProperty("total-projects", "u0");
      expect(stats).toHaveProperty("platform-fee-rate", "u250");
    });

    it("should register a new carbon project", () => {
      const { result } = simnet.callPublicFn(
        "greencredit",
        "register-project",
        [
          '"Solar Farm Project"',
          '"Large scale solar energy project reducing carbon emissions"',
          '"California, USA"',
          "u1", // TYPE_RENEWABLE_ENERGY
          '"VCS"'
        ],
        wallet1
      );
      expect(result).toBeOk();
      expect(result.value).toBe("u1");
    });

    it("should fail to register project with invalid type", () => {
      const { result } = simnet.callPublicFn(
        "greencredit",
        "register-project",
        [
          '"Invalid Project"',
          '"Project with invalid type"',
          '"Location"',
          "u99", // Invalid type
          '"VCS"'
        ],
        wallet1
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u105"); // ERR_INVALID_PROJECT
    });

    it("should verify a project (owner only)", () => {
      // First register a project
      simnet.callPublicFn(
        "greencredit",
        "register-project",
        [
          '"Forest Conservation"',
          '"Protecting old growth forest"',
          '"Amazon, Brazil"',
          "u2", // TYPE_FOREST_CONSERVATION
          '"Gold Standard"'
        ],
        wallet1
      );

      // Verify the project as contract owner
      const { result } = simnet.callPublicFn(
        "greencredit",
        "verify-project",
        ["u1"],
        deployer
      );
      expect(result).toBeOk();
    });

    it("should fail verification from non-owner", () => {
      // Register a project first
      simnet.callPublicFn(
        "greencredit",
        "register-project",
        [
          '"Wind Farm"',
          '"Wind energy project"',
          '"Texas, USA"',
          "u1",
          '"CDM"'
        ],
        wallet1
      );

      // Try to verify as non-owner
      const { result } = simnet.callPublicFn(
        "greencredit",
        "verify-project",
        ["u1"],
        wallet2
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u100"); // ERR_NOT_AUTHORIZED
    });

    it("should issue credits for verified project", () => {
      // Register and verify project
      simnet.callPublicFn(
        "greencredit",
        "register-project",
        [
          '"Carbon Capture"',
          '"Direct air capture facility"',
          '"Iceland"',
          "u3", // TYPE_CARBON_CAPTURE
          '"VCS"'
        ],
        wallet1
      );

      simnet.callPublicFn("greencredit", "verify-project", ["u1"], deployer);

      // Issue credits
      const { result } = simnet.callPublicFn(
        "greencredit",
        "issue-credits",
        [
          "u1", // project-id
          "u1000", // amount (1000 tons)
          "u50000000", // price-per-ton (50 STX)
          "u2024" // vintage-year
        ],
        wallet1
      );
      expect(result).toBeOk();
      expect(result.value).toBe("u1");
    });

    it("should fail to issue credits for unverified project", () => {
      // Register but don't verify project
      simnet.callPublicFn(
        "greencredit",
        "register-project",
        [
          '"Unverified Project"',
          '"Not verified yet"',
          '"Location"',
          "u1",
          '"VCS"'
        ],
        wallet1
      );

      // Try to issue credits
      const { result } = simnet.callPublicFn(
        "greencredit",
        "issue-credits",
        [
          "u1",
          "u1000",
          "u50000000",
          "u2024"
        ],
        wallet1
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u105"); // ERR_INVALID_PROJECT
    });

    it("should retire carbon credits", () => {
      // Setup: register, verify, and issue credits
      simnet.callPublicFn(
        "greencredit",
        "register-project",
        ['"Retirement Test"', '"Test project"', '"Location"', "u1", '"VCS"'],
        wallet1
      );
      simnet.callPublicFn("greencredit", "verify-project", ["u1"], deployer);
      simnet.callPublicFn(
        "greencredit",
        "issue-credits",
        ["u1", "u1000", "u50000000", "u2024"],
        wallet1
      );

      // Retire credits
      const { result } = simnet.callPublicFn(
        "greencredit",
        "retire-credits",
        [
          "u1", // credit-id
          "u500", // amount to retire
          '"Offsetting company emissions"'
        ],
        wallet1
      );
      expect(result).toBeOk();
    });
  });

  describe("Security Features", () => {
    it("should validate string lengths", () => {
      // Try to register project with overly long description
      const longDescription = "x".repeat(501); // Exceeds MAX_STRING_LENGTH
      const { result } = simnet.callPublicFn(
        "greencredit",
        "register-project",
        [
          '"Valid Name"',
          `"${longDescription}"`,
          '"Location"',
          "u1",
          '"VCS"'
        ],
        wallet1
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u109"); // ERR_INVALID_STRING_LENGTH
    });

    it("should validate amount limits", () => {
      // Setup verified project
      simnet.callPublicFn(
        "greencredit",
        "register-project",
        ['"Test Project"', '"Description"', '"Location"', "u1", '"VCS"'],
        wallet1
      );
      simnet.callPublicFn("greencredit", "verify-project", ["u1"], deployer);

      // Try to issue excessive amount
      const { result } = simnet.callPublicFn(
        "greencredit",
        "issue-credits",
        [
          "u1",
          "u1000001", // Exceeds MAX_CREDITS_PER_TRANSACTION
          "u50000000",
          "u2024"
        ],
        wallet1
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u106"); // ERR_INVALID_AMOUNT
    });

    it("should validate vintage year", () => {
      // Setup verified project
      simnet.callPublicFn(
        "greencredit",
        "register-project",
        ['"Test Project"', '"Description"', '"Location"', "u1", '"VCS"'],
        wallet1
      );
      simnet.callPublicFn("greencredit", "verify-project", ["u1"], deployer);

      // Try invalid vintage year
      const { result } = simnet.callPublicFn(
        "greencredit",
        "issue-credits",
        [
          "u1",
          "u1000",
          "u50000000",
          "u1999" // Before MIN_VINTAGE_YEAR
        ],
        wallet1
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u107"); // ERR_INVALID_VINTAGE_YEAR
    });
  });
});
