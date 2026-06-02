# Contributing to Invoice Liquidity Network Smart Contracts

Thank you for your interest in contributing to ILN-Smart-Contract!

> **New here?** Start with the [Developer Quickstart](docs/developer-quickstart.md) — it covers Rust toolchain setup, building, running tests, and deploying to testnet.


## 👥 Code Owners

This repo uses a [CODEOWNERS](.github/CODEOWNERS) file to automatically request reviews from the right team on every PR.

| Path | Owner |
|------|-------|
| `contracts/` | `@Keengfk/contracts-team` |
| `docs/` | `@Keengfk/docs-lead` |
| `scripts/`, `.github/workflows/` | `@Keengfk/devops` |
| `SECURITY.md` | `@Keengfk/security-lead` |
| everything else | `@Keengfk/maintainers` |

CODEOWNER approval is required before merging (enforced via branch protection on `main`). To enable this on a new repo, go to **Settings → Branches → Branch protection rules** and check **Require review from Code Owners**.


## 🧪 Testing

### Running Unit and Integration Tests

To run the standard unit and integration tests for the governance, distribution, and reputation contracts:

```bash
cargo test
```

### 🧬 Running the Fuzz Suite

We use property-based testing and fuzzing via `proptest` to check contract safety and robustness under random inputs.

To run the fuzz tests:

```bash
cargo test -p iln_fuzz
```

The fuzz suite tests `submit_invoice()` with randomized parameters (amount, discount rate, due date, and randomized account/contract address payloads) and verifies that the contract never panics and handles invalid inputs gracefully.
