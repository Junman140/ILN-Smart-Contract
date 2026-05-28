# ILN Governance

This document reflects the governance system as actually implemented in
`contracts/iln_governance/src/lib.rs`.  It covers proposal creation, voting
mechanics, quorum rules, execution, and security considerations.

---

## Table of contents

1. [Overview](#1-overview)
2. [Governance token and voting power](#2-governance-token-and-voting-power)
3. [Governable parameters](#3-governable-parameters)
4. [Proposal lifecycle](#4-proposal-lifecycle)
5. [Worked example — end-to-end proposal](#5-worked-example--end-to-end-proposal)
6. [Quorum and majority rules](#6-quorum-and-majority-rules)
7. [Execution mechanics](#7-execution-mechanics)
8. [Security considerations](#8-security-considerations)
9. [Past governance decisions](#9-past-governance-decisions)

---

## 1. Overview

ILN governance lets token holders propose and vote on protocol changes on-chain.
The `GovContract` (`contracts/iln_governance`) orchestrates voting; when a
proposal passes it cross-contract-calls the `InvoiceLiquidityContract` to apply
the change atomically.

There is currently **no timelock delay** between a proposal passing and its
execution.  `execute_proposal` is callable by anyone once the voting period ends
and quorum/majority criteria are met.

---

## 2. Governance token and voting power

Voting power is read from per-proposal checkpoints, not the live balance at vote
call time. When a proposal is created, the proposer’s current governance-token
balance is recorded as the initial checkpoint. The contract also maintains a
proposal-scoped checkpoint for each voter; if no checkpoint exists yet, the
first vote records that voter’s current balance and reuses it for the duration
of the proposal.

| Property | Value |
|----------|-------|
| Token | Address supplied to `initialize(gov_token)` |
| Unit of power | 1 token = 1 vote (raw balance in stroops) |
| Snapshot | Per-proposal voter checkpoint stored in contract storage |
| Minimum power | Must be > 0 (0-balance callers are rejected with `GovernanceError::NoVotingPower`) |

---

## 3. Governable parameters

All on-chain actions are defined by the `ProposalType` enum.

| Variant | Target function | Description |
|---------|----------------|-------------|
| `UpdateFeeRate(u32)` | `update_fee_rate` | Set protocol fee in basis points (0–10 000) |
| `UpdateMaxDiscountRate(u32)` | `update_max_discount` | Cap on invoice discount rates in basis points |
| `AddToken(Address)` | `add_token` | Whitelist a new payment token |
| `RemoveToken(Address)` | `remove_token` | Delist an existing payment token |

Admin-only functions that are **not** yet governable (callable only by the
`Admin` key, not via governance): `set_admin`, `set_distribution_contract`.

---

## 4. Proposal lifecycle

```
                ┌─────────────┐
                │   Created   │  create_proposal() called
                └──────┬──────┘
                       │  voting opens immediately
                ┌──────▼──────┐
                │   Active    │  voters call vote(support=true/false)
                └──────┬──────┘
                       │  end_time reached (3-day window)
          ┌────────────┼────────────┐
          │            │            │
   ┌──────▼──────┐    │     ┌──────▼──────┐
   │   Failed    │    │     │   Passed    │  quorum met + majority For
   │ (no quorum) │    │     └──────┬──────┘
   └─────────────┘    │            │  execute_proposal() called
                      │     ┌──────▼──────┐
                      │     │  Executed   │  ILN contract updated
                      │     └─────────────┘
               ┌──────▼──────┐
               │   Failed    │  quorum met but majority Against
               └─────────────┘
```

### Voting window

Each proposal has a fixed **3-day (259 200 second)** voting window starting
from the ledger timestamp at the moment `create_proposal` is invoked.

### Double-vote prevention

A `HasVoted(proposal_id, voter_address)` key is stored in Soroban temporary
storage when a vote is cast. The receipt is only needed through the proposal's
3-day voting window, so it is extended to 69,120 ledgers: approximately 4 days
at 5 seconds per ledger. This covers the full voting period plus a 1-day buffer
for boundary reads and indexers while allowing automatic expiry. Attempting to
vote again while the receipt is live returns `AlreadyVoted`.

---

## 5. Worked example — end-to-end proposal

Suppose the community wants to raise the protocol fee from 0 to 50 bps (0.5%).

```
Step 1 — Create the proposal
────────────────────────────
Caller: any address (no minimum token balance required to propose)
Function: GovContract::create_proposal(creator, ProposalType::UpdateFeeRate(50))
Result: proposal_id = 1
        end_time    = now + 259_200

Step 2 — Vote
─────────────
During the 3-day window, token holders call:
  GovContract::cast_vote(voter_addr, proposal_id=1, support=true)   // For
  GovContract::cast_vote(voter_addr, proposal_id=1, support=false)  // Against

Each call uses the stored checkpoint weight for that proposal/voter pair and
adds it to votes_for or votes_against. This prevents balance changes after the
checkpoint from changing the voter's weight mid-proposal.

Step 3 — Execute (after end_time)
──────────────────────────────────
Anyone calls: GovContract::execute_proposal(proposal_id=1, total_supply)

The contract checks:
  total_votes = votes_for + votes_against
  quorum      = total_supply / 10          (10% of supply)

  If total_votes < quorum  → status = Failed,  panic "quorum not reached"
  If votes_for > votes_against → status = Passed, then:
    invoke_contract(iln_contract, "update_fee_rate", [50])
    status = Executed
  Else → status = Failed, panic "proposal rejected"
```

---

## 6. Quorum and majority rules

| Parameter | Value | Source |
|-----------|-------|--------|
| Quorum threshold | 10% of `total_supply` passed to `execute_proposal` | `total_supply / 10` |
| Majority rule | Simple majority (`votes_for > votes_against`) | Strict `>` |
| Abstain option | Not supported; every vote is For or Against | — |

> **Note:** `total_supply` is a caller-supplied argument to `execute_proposal`,
> not read from the token contract.  An incorrect value will distort the quorum
> check.  Future governance iterations should read supply on-chain.

---

## 7. Execution mechanics

`execute_proposal` uses `env.invoke_contract` to call the ILN contract
synchronously.  If the cross-contract call reverts, `execute_proposal`
also reverts, leaving the proposal status unchanged (`Passed`).  It can be
retried once the root cause is fixed.

There is **no timelock delay** — execution happens in the same transaction as
the `execute_proposal` call, immediately after the voting window closes.

---

## 8. Security considerations

### Quorum attacks

An attacker with > 10% of supply can reach quorum alone.  Mitigations:
- Increase the quorum threshold (via a governance proposal on `UpdateMaxDiscountRate` or a future `UpdateQuorum` variant).
- Introduce a minimum proposal delay so the community can react before voting starts.

### Flash-loan / balance manipulation

Voting power is pinned to proposal-scoped checkpoints, so later balance changes
cannot inflate a voter's weight during an active proposal. The proposer's
balance is snapshotted at proposal creation, and other voters are checkpointed
when they first vote.

### Delegation

Delegation is **not implemented**.  Each token holder must vote directly.

### Admin key risk

`set_admin` is callable by the current admin only and is outside governance
scope.  A compromised admin key can bypass governance entirely for
`set_admin` and `set_distribution_contract`.

An `AdminChanged` event is emitted on every admin transition, providing an
on-chain audit trail.

### Double-proposal spam

There is no minimum token balance or deposit required to create a proposal,
and no cooldown period.  Anyone can flood the governance queue.  A future
`min_proposal_deposit` guard is recommended.

---

## 9. Past governance decisions

*This section serves as a historical record of community decisions.*

- *(Currently empty — no proposals have been executed yet.)*
