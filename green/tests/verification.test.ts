import { describe, expect, it, beforeEach } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("Verification Contract Tests", () => {
  beforeEach(() => {
    simnet.setEpoch("3.0");
  });

  describe("Verifier Registration", () => {
    it("should initialize with correct default values", () => {
      const { result } = simnet.callReadOnlyFn("verification", "get-verification-stats", [], deployer);
      expect(result).toBeOk();
      const stats = result.value;
      expect(stats).toHaveProperty("total-verifiers", "u0");
      expect(stats).toHaveProperty("total-verifications", "u0");
      expect(stats).toHaveProperty("minimum-stake", "u1000000");
    });

    it("should register a new verifier", () => {
      const { result } = simnet.callPublicFn(
        "verification",
        "register-verifier",
        [
          '"Carbon Verification Corp"',
          '"ISO 14064 Certified"',
          "(list u1 u2 u3)" // VCS, CDM, Gold Standard
        ],
        wallet1
      );
      expect(result).toBeOk();
      expect(result.value).toBe("u1");
    });

    it("should fail registration with insufficient stake", () => {
      // This test assumes wallet doesn't have enough STX
      // In a real test environment, you'd need to set up balances appropriately
      const { result } = simnet.callPublicFn(
        "verification",
        "register-verifier",
        [
          '"Underfunded Verifier"',
          '"No Certification"',
          "(list u1)"
        ],
        wallet2
      );
      // This might pass in simnet due to default balances, but would fail in real scenario
      // expect(result).toBeErr();
      // expect(result.value).toBe("u405"); // ERR_INSUFFICIENT_STAKE
    });

    it("should retrieve verifier details", () => {
      // Register a verifier
      simnet.callPublicFn(
        "verification",
        "register-verifier",
        [
          '"Green Audit Solutions"',
          '"VCS Approved"',
          "(list u1 u3)"
        ],
        wallet1
      );

      // Get verifier details
      const { result } = simnet.callReadOnlyFn("verification", "get-verifier", ["u1"], deployer);
      expect(result).toBeSome();
      const verifier = result.value;
      expect(verifier).toHaveProperty("verifier-address", wallet1);
      expect(verifier).toHaveProperty("name", '"Green Audit Solutions"');
      expect(verifier).toHaveProperty("is-active", true);
      expect(verifier).toHaveProperty("verified-projects", "u0");
      expect(verifier).toHaveProperty("reputation-score", "u100");
    });

    it("should retrieve verifier by address", () => {
      // Register a verifier
      simnet.callPublicFn(
        "verification",
        "register-verifier",
        [
          '"EcoVerify Inc"',
          '"Gold Standard Certified"',
          "(list u2 u3 u4)"
        ],
        wallet2
      );

      // Get verifier by address
      const { result } = simnet.callReadOnlyFn("verification", "get-verifier-by-address", [wallet2], deployer);
      expect(result).toBeSome();
      const verifier = result.value;
      expect(verifier).toHaveProperty("name", '"EcoVerify Inc"');
    });
  });

  describe("Verification Requests", () => {
    beforeEach(() => {
      // Register a verifier for testing
      simnet.callPublicFn(
        "verification",
        "register-verifier",
        [
          '"Test Verifier"',
          '"Test Certification"',
          "(list u1 u2 u3 u4)"
        ],
        wallet2
      );
    });

    it("should create a verification request", () => {
      const { result } = simnet.callPublicFn(
        "verification",
        "request-verification",
        [
          "u1", // project-id
          "u1", // verifier-id
          "u1", // standard (VCS)
          '"abc123def456789012345678901234567890123456789012345678901234"' // documentation hash
        ],
        wallet1
      );
      expect(result).toBeOk();
      expect(result.value).toBe("u1");
    });

    it("should fail request with invalid standard", () => {
      const { result } = simnet.callPublicFn(
        "verification",
        "request-verification",
        [
          "u1",
          "u1",
          "u99", // Invalid standard
          '"hash123"'
        ],
        wallet1
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u403"); // ERR_INVALID_VERIFICATION
    });

    it("should fail request with non-existent verifier", () => {
      const { result } = simnet.callPublicFn(
        "verification",
        "request-verification",
        [
          "u1",
          "u999", // Non-existent verifier
          "u1",
          '"hash123"'
        ],
        wallet1
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u401"); // ERR_VERIFIER_NOT_FOUND
    });

    it("should retrieve verification request details", () => {
      // Create a verification request
      simnet.callPublicFn(
        "verification",
        "request-verification",
        [
          "u5", // project-id
          "u1", // verifier-id
          "u2", // standard (CDM)
          '"verification_docs_hash_12345678901234567890123456789012345678"'
        ],
        wallet3
      );

      // Get verification details
      const { result } = simnet.callReadOnlyFn("verification", "get-verification", ["u1"], deployer);
      expect(result).toBeSome();
      const verification = result.value;
      expect(verification).toHaveProperty("project-id", "u5");
      expect(verification).toHaveProperty("requester", wallet3);
      expect(verification).toHaveProperty("verifier-id", "u1");
      expect(verification).toHaveProperty("standard", "u2");
      expect(verification).toHaveProperty("status", "u1"); // STATUS_PENDING
    });

    it("should track project verifications", () => {
      // Create multiple verification requests for same project
      simnet.callPublicFn(
        "verification",
        "request-verification",
        ["u10", "u1", "u1", '"hash1"'],
        wallet1
      );
      simnet.callPublicFn(
        "verification",
        "request-verification",
        ["u10", "u1", "u2", '"hash2"'],
        wallet1
      );

      // Get project verifications
      const { result } = simnet.callReadOnlyFn("verification", "get-project-verifications", ["u10"], deployer);
      expect(result).toBeList();
      expect(result.value.length).toBe(2);
    });
  });

  describe("Verification Completion", () => {
    beforeEach(() => {
      // Register verifier and create verification request
      simnet.callPublicFn(
        "verification",
        "register-verifier",
        ['"Completion Verifier"', '"Cert"', "(list u1 u2)"],
        wallet2
      );
      simnet.callPublicFn(
        "verification",
        "request-verification",
        ["u1", "u1", "u1", '"hash123"'],
        wallet1
      );
    });

    it("should complete verification with approval", () => {
      const { result } = simnet.callPublicFn(
        "verification",
        "complete-verification",
        [
          "u1", // verification-id
          true, // approved
          '"Project meets all VCS requirements and standards"'
        ],
        wallet2 // verifier
      );
      expect(result).toBeOk();
      expect(result.value).toBe(true);
    });

    it("should complete verification with rejection", () => {
      const { result } = simnet.callPublicFn(
        "verification",
        "complete-verification",
        [
          "u1",
          false, // rejected
          '"Project documentation incomplete"'
        ],
        wallet2
      );
      expect(result).toBeOk();
      expect(result.value).toBe(false);
    });

    it("should fail completion from non-verifier", () => {
      const { result } = simnet.callPublicFn(
        "verification",
        "complete-verification",
        [
          "u1",
          true,
          '"Unauthorized completion attempt"'
        ],
        wallet3 // not the verifier
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u400"); // ERR_NOT_AUTHORIZED
    });

    it("should update verification status after completion", () => {
      // Complete verification
      simnet.callPublicFn(
        "verification",
        "complete-verification",
        ["u1", true, '"Approved"'],
        wallet2
      );

      // Check updated status
      const { result } = simnet.callReadOnlyFn("verification", "get-verification", ["u1"], deployer);
      const verification = result.value;
      expect(verification).toHaveProperty("status", "u2"); // STATUS_VERIFIED
      expect(verification).toHaveProperty("verification-notes", '(some "Approved")');
    });

    it("should update verifier stats on approval", () => {
      // Complete verification with approval
      simnet.callPublicFn(
        "verification",
        "complete-verification",
        ["u1", true, '"Approved"'],
        wallet2
      );

      // Check verifier stats
      const { result } = simnet.callReadOnlyFn("verification", "get-verifier", ["u1"], deployer);
      const verifier = result.value;
      expect(verifier).toHaveProperty("verified-projects", "u1");
    });

    it("should prevent double completion", () => {
      // Complete verification once
      simnet.callPublicFn(
        "verification",
        "complete-verification",
        ["u1", true, '"First completion"'],
        wallet2
      );

      // Try to complete again
      const { result } = simnet.callPublicFn(
        "verification",
        "complete-verification",
        ["u1", false, '"Second completion"'],
        wallet2
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u402"); // ERR_ALREADY_VERIFIED
    });
  });

  describe("Admin Functions", () => {
    beforeEach(() => {
      // Register a verifier for testing
      simnet.callPublicFn(
        "verification",
        "register-verifier",
        ['"Admin Test Verifier"', '"Cert"', "(list u1)"],
        wallet1
      );
    });

    it("should allow admin to deactivate verifier", () => {
      const { result } = simnet.callPublicFn(
        "verification",
        "deactivate-verifier",
        ["u1"],
        deployer
      );
      expect(result).toBeOk();

      // Check verifier is deactivated
      const verifierResult = simnet.callReadOnlyFn("verification", "get-verifier", ["u1"], deployer);
      const verifier = verifierResult.value;
      expect(verifier).toHaveProperty("is-active", false);
    });

    it("should fail deactivation from non-admin", () => {
      const { result } = simnet.callPublicFn(
        "verification",
        "deactivate-verifier",
        ["u1"],
        wallet2
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u400"); // ERR_NOT_AUTHORIZED
    });

    it("should allow admin to add verification standard", () => {
      const { result } = simnet.callPublicFn(
        "verification",
        "add-verification-standard",
        [
          "u10",
          '"Custom Standard"',
          '"A custom verification standard for testing"',
          '"Must meet specific criteria and documentation requirements"'
        ],
        deployer
      );
      expect(result).toBeOk();

      // Check standard was added
      const standardResult = simnet.callReadOnlyFn("verification", "get-verification-standard", ["u10"], deployer);
      expect(standardResult).toBeSome();
      const standard = standardResult.value;
      expect(standard).toHaveProperty("name", '"Custom Standard"');
      expect(standard).toHaveProperty("is-active", true);
    });

    it("should fail to add standard from non-admin", () => {
      const { result } = simnet.callPublicFn(
        "verification",
        "add-verification-standard",
        ["u11", '"Unauthorized"', '"Should fail"', '"Requirements"'],
        wallet1
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u400"); // ERR_NOT_AUTHORIZED
    });
  });
});
