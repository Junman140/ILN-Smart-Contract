# Contributing to Invoice Liquidity Network Smart Contracts

Thank you for your interest in contributing to ILN-Smart-Contract!

> **New here?** Start with the [Developer Quickstart](docs/developer-quickstart.md) — it covers Rust toolchain setup, building, running tests, and deploying to testnet.


## 📝 Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) so that the changelog can be generated automatically with `make changelog`.

**Format:** `<type>(<optional scope>): <description>`

| Type | When to use |
|------|-------------|
| `feat` | A new feature or contract function |
| `fix` | A bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `docs` | Documentation only changes |
| `chore` | Build process, tooling, or dependency updates |

**Examples:**
```
feat(governance): add quorum requirement for proposal passing
fix: resolve discount rate validation overflow
docs: add architecture decision records
test: add fuzz suite for submit_invoice
chore: add CHANGELOG and git-cliff changelog automation
```

Breaking changes must include `BREAKING CHANGE:` in the commit footer:
```
feat!: rename fund_invoice to fund

BREAKING CHANGE: fund_invoice has been renamed to fund in the invoice_liquidity contract.
```


## 🎨 Formatting

All code must be formatted with `rustfmt` before committing. CI will reject unformatted code.

```bash
cargo fmt --all
```

Project-specific settings are in [`rustfmt.toml`](rustfmt.toml) (`max_width = 100`, `edition = "2021"`).


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
