import { describe, expect, it, beforeEach } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("Governance Contract Tests", () => {
  beforeEach(() => {
    simnet.setEpoch("3.0");
  });

  describe("Proposal Management", () => {
    it("should initialize with correct default values", () => {
      const { result } = simnet.callReadOnlyFn("governance", "get-governance-stats", [], deployer);
      expect(result).toBeOk();
      const stats = result.value;
      expect(stats).toHaveProperty("total-proposals", "u0");
      expect(stats).toHaveProperty("voting-period", "u1440");
      expect(stats).toHaveProperty("quorum-threshold", "u1000");
      expect(stats).toHaveProperty("pass-threshold", "u5000");
    });

    it("should create a proposal", () => {
      const { result } = simnet.callPublicFn(
        "governance",
        "create-proposal",
        [
          "u1", // PROPOSAL_TYPE_FEE_CHANGE
          '"Reduce Platform Fee"',
          '"Proposal to reduce platform fee from 2.5% to 2.0%"',
          '"platform-fee-rate"',
          "u200", // new value (2.0%)
          "none" // no target address
        ],
        wallet1
      );
      expect(result).toBeOk();
      expect(result.value).toBe("u1");
    });

    it("should fail to create proposal with insufficient voting power", () => {
      // First set low voting power for wallet2
      simnet.callPublicFn("governance", "update-voting-power", [wallet2, "u10"], deployer);

      const { result } = simnet.callPublicFn(
        "governance",
        "create-proposal",
        [
          "u2",
          '"Test Proposal"',
          '"Should fail"',
          '"test-param"',
          "u100",
          "none"
        ],
        wallet2
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u304"); // ERR_INSUFFICIENT_VOTING_POWER
    });

    it("should retrieve proposal details", () => {
      // Create a proposal
      simnet.callPublicFn(
        "governance",
        "create-proposal",
        [
          "u3", // PROPOSAL_TYPE_VERIFIER_ADD
          '"Add New Verifier"',
          '"Proposal to add a new carbon credit verifier"',
          '"verifier-address"',
          "u0",
          `(some ${wallet3})`
        ],
        wallet1
      );

      // Get proposal details
      const { result } = simnet.callReadOnlyFn("governance", "get-proposal", ["u1"], deployer);
      expect(result).toBeSome();
      const proposal = result.value;
      expect(proposal).toHaveProperty("proposer", wallet1);
      expect(proposal).toHaveProperty("proposal-type", "u3");
      expect(proposal).toHaveProperty("title", '"Add New Verifier"');
      expect(proposal).toHaveProperty("votes-for", "u0");
      expect(proposal).toHaveProperty("votes-against", "u0");
      expect(proposal).toHaveProperty("is-executed", false);
    });
  });

  describe("Voting System", () => {
    beforeEach(() => {
      // Set up voting power for test accounts
      simnet.callPublicFn("governance", "update-voting-power", [wallet1, "u1000"], deployer);
      simnet.callPublicFn("governance", "update-voting-power", [wallet2, "u800"], deployer);
      simnet.callPublicFn("governance", "update-voting-power", [wallet3, "u600"], deployer);
      
      // Create a test proposal
      simnet.callPublicFn(
        "governance",
        "create-proposal",
        [
          "u1",
          '"Test Voting"',
          '"Test proposal for voting"',
          '"test-param"',
          "u100",
          "none"
        ],
        wallet1
      );
    });

    it("should allow voting on active proposal", () => {
      const { result } = simnet.callPublicFn(
        "governance",
        "vote",
        [
          "u1", // proposal-id
          true // vote for
        ],
        wallet2
      );
      expect(result).toBeOk();
    });

    it("should prevent double voting", () => {
      // First vote
      simnet.callPublicFn("governance", "vote", ["u1", true], wallet2);

      // Try to vote again
      const { result } = simnet.callPublicFn("governance", "vote", ["u1", false], wallet2);
      expect(result).toBeErr();
      expect(result.value).toBe("u303"); // ERR_ALREADY_VOTED
    });

    it("should record vote details", () => {
      // Cast a vote
      simnet.callPublicFn("governance", "vote", ["u1", true], wallet2);

      // Check vote record
      const { result } = simnet.callReadOnlyFn("governance", "get-vote", ["u1", wallet2], deployer);
      expect(result).toBeSome();
      const vote = result.value;
      expect(vote).toHaveProperty("vote-for", true);
      expect(vote).toHaveProperty("vote-power", "u800");
    });

    it("should update proposal vote counts", () => {
      // Cast votes
      simnet.callPublicFn("governance", "vote", ["u1", true], wallet1); // 1000 for
      simnet.callPublicFn("governance", "vote", ["u1", false], wallet2); // 800 against
      simnet.callPublicFn("governance", "vote", ["u1", true], wallet3); // 600 for

      // Check proposal vote counts
      const { result } = simnet.callReadOnlyFn("governance", "get-proposal", ["u1"], deployer);
      const proposal = result.value;
      expect(proposal).toHaveProperty("votes-for", "u1600"); // 1000 + 600
      expect(proposal).toHaveProperty("votes-against", "u800");
    });

    it("should track proposal voters", () => {
      // Cast votes
      simnet.callPublicFn("governance", "vote", ["u1", true], wallet1);
      simnet.callPublicFn("governance", "vote", ["u1", false], wallet2);

      // Check voter list
      const { result } = simnet.callReadOnlyFn("governance", "get-proposal-voters", ["u1"], deployer);
      expect(result).toBeList();
      expect(result.value.length).toBe(2);
    });
  });

  describe("Proposal Execution", () => {
    beforeEach(() => {
      // Set up voting power
      simnet.callPublicFn("governance", "update-voting-power", [wallet1, "u6000"], deployer);
      simnet.callPublicFn("governance", "update-voting-power", [wallet2, "u4000"], deployer);
      
      // Set total voting power for quorum calculation
      simnet.callPublicFn("governance", "update-voting-power", [deployer, "u10000"], deployer);
    });

    it("should execute passed proposal after voting period", () => {
      // Create proposal
      simnet.callPublicFn(
        "governance",
        "create-proposal",
        [
          "u1",
          '"Passed Proposal"',
          '"This should pass"',
          '"test-param"',
          "u100",
          "none"
        ],
        wallet1
      );

      // Vote in favor (6000 votes for, meeting quorum and pass threshold)
      simnet.callPublicFn("governance", "vote", ["u1", true], wallet1);

      // Advance blocks past voting period
      simnet.mineEmptyBlocks(1441);

      // Execute proposal
      const { result } = simnet.callPublicFn("governance", "execute-proposal", ["u1"], deployer);
      expect(result).toBeOk();
      const execution = result.value;
      expect(execution).toHaveProperty("executed", true);
      expect(execution).toHaveProperty("passed", true);
    });

    it("should fail execution during voting period", () => {
      // Create proposal
      simnet.callPublicFn(
        "governance",
        "create-proposal",
        [
          "u1",
          '"Active Proposal"',
          '"Still in voting period"',
          '"test-param"',
          "u100",
          "none"
        ],
        wallet1
      );

      // Try to execute immediately
      const { result } = simnet.callPublicFn("governance", "execute-proposal", ["u1"], deployer);
      expect(result).toBeErr();
      expect(result.value).toBe("u302"); // ERR_VOTING_ENDED
    });

    it("should mark proposal as failed if it doesn't meet quorum", () => {
      // Create proposal
      simnet.callPublicFn(
        "governance",
        "create-proposal",
        [
          "u1",
          '"Low Turnout"',
          '"Not enough votes"',
          '"test-param"',
          "u100",
          "none"
        ],
        wallet1
      );

      // Cast minimal vote (not meeting quorum)
      simnet.callPublicFn("governance", "vote", ["u1", true], wallet2); // Only 4000 votes

      // Advance blocks past voting period
      simnet.mineEmptyBlocks(1441);

      // Execute proposal
      const { result } = simnet.callPublicFn("governance", "execute-proposal", ["u1"], deployer);
      expect(result).toBeOk();
      const execution = result.value;
      expect(execution).toHaveProperty("executed", true);
      expect(execution).toHaveProperty("passed", false); // Failed due to low quorum
    });

    it("should prevent double execution", () => {
      // Create and pass proposal
      simnet.callPublicFn(
        "governance",
        "create-proposal",
        [
          "u1",
          '"Double Execute Test"',
          '"Test double execution"',
          '"test-param"',
          "u100",
          "none"
        ],
        wallet1
      );
      simnet.callPublicFn("governance", "vote", ["u1", true], wallet1);
      simnet.mineEmptyBlocks(1441);
      simnet.callPublicFn("governance", "execute-proposal", ["u1"], deployer);

      // Try to execute again
      const { result } = simnet.callPublicFn("governance", "execute-proposal", ["u1"], deployer);
      expect(result).toBeErr();
      expect(result.value).toBe("u306"); // ERR_PROPOSAL_ALREADY_EXECUTED
    });
  });

  describe("Admin Functions", () => {
    it("should allow owner to update voting power", () => {
      const { result } = simnet.callPublicFn(
        "governance",
        "update-voting-power",
        [wallet1, "u5000"],
        deployer
      );
      expect(result).toBeOk();

      // Verify voting power was updated
      const powerResult = simnet.callReadOnlyFn("governance", "get-voting-power-of", [wallet1], deployer);
      expect(powerResult.value).toBe("u5000");
    });

    it("should fail to update voting power from non-owner", () => {
      const { result } = simnet.callPublicFn(
        "governance",
        "update-voting-power",
        [wallet2, "u5000"],
        wallet1
      );
      expect(result).toBeErr();
      expect(result.value).toBe("u300"); // ERR_NOT_AUTHORIZED
    });
  });
});
