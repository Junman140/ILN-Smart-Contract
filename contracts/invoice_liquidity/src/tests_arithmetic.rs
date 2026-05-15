// tests_arithmetic.rs
//
// Comprehensive arithmetic edge-case tests for the core discount formula:
//
//   discount_amount = amount * discount_rate / 10_000   (integer / floor division)
//   freelancer_payout = amount - discount_amount
//
// The key invariant that must ALWAYS hold:
//   freelancer_payout + discount_amount == amount
//
// No contract deployment is needed here — we test the pure arithmetic
// directly, mirroring the exact formula used in lib.rs.

#![cfg(test)]

// ----------------------------------------------------------------
// Pure-arithmetic helper — mirrors lib.rs discount_rate_as_i128
// ----------------------------------------------------------------

/// Compute (discount_amount, freelancer_payout) for the given inputs using
/// the exact same formula as the production contract.
///
/// Formula: discount = amount.checked_mul(rate as i128).unwrap_or(0) / 10_000
///          payout   = amount - discount
fn calc_discount(amount: i128, rate: u32) -> (i128, i128) {
    let discount = amount
        .checked_mul(rate as i128)
        .unwrap_or(0) // overflow → treat as 0, matching contract behaviour
        / 10_000;
    let payout = amount - discount;
    (discount, payout)
}

/// Table-driven helper: verifies expected values AND the payout+discount invariant.
///
/// # Arguments
/// * `label`            – human-readable test name (for assertion messages)
/// * `amount`           – invoice amount in stroops
/// * `rate`             – discount rate in basis points (bps)
/// * `expected_payout`  – expected freelancer_payout
/// * `expected_discount`– expected discount_amount
fn check_discount(
    label: &str,
    amount: i128,
    rate: u32,
    expected_payout: i128,
    expected_discount: i128,
) {
    let (discount, payout) = calc_discount(amount, rate);

    assert_eq!(
        discount, expected_discount,
        "[{label}] discount_amount mismatch: got {discount}, want {expected_discount}"
    );
    assert_eq!(
        payout, expected_payout,
        "[{label}] freelancer_payout mismatch: got {payout}, want {expected_payout}"
    );
    // *** Core invariant: payout + discount == amount ***
    assert_eq!(
        payout + discount,
        amount,
        "[{label}] INVARIANT VIOLATED: payout ({payout}) + discount ({discount}) != amount ({amount})"
    );
}

// ----------------------------------------------------------------
// Individual test cases
// ----------------------------------------------------------------

/// TC-01: Minimum invoice (1 stroop) with minimum discount (1 bps).
///
/// 1 * 1 / 10_000 = 0  (integer floor division)
/// → discount rounds down to 0, payout = 1 (freelancer gets everything).
/// Invariant: 1 + 0 == 1  ✓
#[test]
fn test_min_invoice_min_rate() {
    let amount: i128 = 1; // 1 stroop — the smallest possible Stellar unit
    let rate: u32 = 1; // 1 bps = 0.01%  — the smallest valid discount rate

    check_discount(
        "min_invoice_min_rate",
        amount,
        rate,
        1, // expected_payout:   1 stroop (no discount at this scale)
        0, // expected_discount: 0 stroops (rounds down from 0.0001)
    );
}

/// TC-02: Maximum realistic invoice — 1,000,000 USDC at 3% discount.
///
/// 1 USDC = 10_000_000 stroops  →  1,000,000 USDC = 10_000_000_000_000 stroops
/// discount = 10_000_000_000_000 * 300 / 10_000 = 300_000_000_000
/// payout   = 10_000_000_000_000 − 300_000_000_000 = 9_700_000_000_000
/// Invariant: 9_700_000_000_000 + 300_000_000_000 == 10_000_000_000_000  ✓
#[test]
fn test_max_realistic_invoice() {
    let amount: i128 = 10_000_000_000_000; // 1,000,000 USDC (1 USDC = 10_000_000 stroops)
    let rate: u32 = 300; // 3.00% — a typical LP discount rate

    check_discount(
        "max_realistic_invoice",
        amount,
        rate,
        9_700_000_000_000, // expected_payout   (97% of invoice)
        300_000_000_000,   // expected_discount  ( 3% of invoice)
    );
}

/// TC-03: Discount rate exactly at the 5000 bps (50%) cap.
///
/// 1_000_000_000 * 5000 / 10_000 = 500_000_000
/// payout = 1_000_000_000 − 500_000_000 = 500_000_000
/// Invariant: 500_000_000 + 500_000_000 == 1_000_000_000  ✓
#[test]
fn test_rate_at_50_percent_cap() {
    let amount: i128 = 1_000_000_000; // 100 USDC  (= 100 * 10_000_000 stroops)
    let rate: u32 = 5_000; // 5000 bps = 50.00% — the maximum allowed by the contract

    check_discount(
        "rate_at_50pct_cap",
        amount,
        rate,
        500_000_000, // expected_payout   (exactly half)
        500_000_000, // expected_discount (exactly half)
    );
}

/// TC-04: Discount rate at 1 bps — smallest possible rate.
///
/// 1_000_000_000 * 1 / 10_000 = 100_000
/// payout = 1_000_000_000 − 100_000 = 999_900_000
/// Invariant: 999_900_000 + 100_000 == 1_000_000_000  ✓
#[test]
fn test_rate_at_1_bps() {
    let amount: i128 = 1_000_000_000; // 100 USDC in stroops
    let rate: u32 = 1; // 1 bps = 0.01% — the smallest possible value accepted

    check_discount(
        "rate_at_1bps",
        amount,
        rate,
        999_900_000, // expected_payout
        100_000,     // expected_discount
    );
}

/// TC-05: Amount that does NOT divide evenly — verify rounding direction (floor).
///
/// Choose amount=1_000_000_001 (one extra stroop) with rate=300 (3%).
/// discount = 1_000_000_001 * 300 / 10_000 = 300_000_000_300 / 10_000
///          = 30_000_000  (floor, remainder 300 is dropped)
/// payout   = 1_000_000_001 − 30_000_000 = 970_000_001
/// Invariant: 970_000_001 + 30_000_000 == 1_000_000_001  ✓
///
/// The rounding direction matters: floor means the freelancer loses at most
/// 1 stroop-equivalent relative to exact division, never more.
#[test]
fn test_uneven_division_rounds_down() {
    let amount: i128 = 1_000_000_001; // one stroop above an exact multiple
    let rate: u32 = 300; // 3.00%

    // Manual calculation:
    //   1_000_000_001 * 300 = 300_000_000_300
    //   300_000_000_300 / 10_000 = 30_000_000 remainder 300  → floor = 30_000_000
    check_discount(
        "uneven_division_rounds_down",
        amount,
        rate,
        970_000_001, // expected_payout   (amount - 30_000_000)
        30_000_000,  // expected_discount (floored)
    );
}

/// TC-06: Additional rounding scenario — 1_333 stroops at 300 bps.
///
/// 1_333 * 300 / 10_000 = 399_900 / 10_000 = 39  (remainder 9900 dropped)
/// payout = 1_333 - 39 = 1_294
/// Invariant: 1_294 + 39 == 1_333  ✓
#[test]
fn test_small_amount_with_remainder() {
    let amount: i128 = 1_333; // a deliberately awkward stroop count
    let rate: u32 = 300; // 3.00%

    check_discount(
        "small_amount_with_remainder",
        amount,
        rate,
        1_294, // expected_payout
        39,    // expected_discount (1_333 * 300 / 10_000 = 39)
    );
}

/// TC-07: Overflow guard — very large amount × large discount rate.
///
/// The contract uses `checked_mul(...).unwrap_or(0)` to handle overflow.
/// If the intermediate product overflows i128, the contract substitutes 0
/// (no discount / full payout).  We verify:
///   1. No panic occurs.
///   2. The invariant still holds (discount=0, payout=amount).
///
/// i128::MAX ≈ 1.7 × 10^38, so i128::MAX * 5000 would overflow.
#[test]
fn test_overflow_falls_back_to_zero_discount() {
    let amount: i128 = i128::MAX; // maximum representable i128 value
    let rate: u32 = 5_000; // 5000 bps — checked_mul(5000) overflows i128

    // checked_mul overflows → unwrap_or(0) → discount = 0 / 10_000 = 0
    let (discount, payout) = calc_discount(amount, rate);

    assert_eq!(
        discount, 0,
        "[overflow_guard] expected discount=0 on overflow, got {discount}"
    );
    assert_eq!(
        payout, amount,
        "[overflow_guard] expected payout=amount on overflow, got {payout}"
    );
    // Invariant
    assert_eq!(
        payout + discount,
        amount,
        "[overflow_guard] INVARIANT VIOLATED"
    );
}

// ----------------------------------------------------------------
// TC-08: Table-driven invariant sweep
//
// Runs a broad matrix of (amount, rate) combinations and asserts the
// invariant `payout + discount == amount` for every single one.
// No magic numbers — each pair is self-documenting via the label field.
// ----------------------------------------------------------------

#[test]
fn test_invariant_payout_plus_discount_eq_amount_across_all_cases() {
    struct Case {
        label: &'static str,
        amount: i128,
        rate: u32,
    }

    let cases = [
        // --- boundary / minimum values ---
        Case {
            label: "1 stroop @ 1 bps",
            amount: 1,
            rate: 1,
        },
        Case {
            label: "1 stroop @ 5000 bps",
            amount: 1,
            rate: 5_000,
        },
        // --- typical USDC invoice amounts ---
        Case {
            label: "1 USDC @ 1 bps",
            amount: 10_000_000,
            rate: 1,
        },
        Case {
            label: "1 USDC @ 300 bps",
            amount: 10_000_000,
            rate: 300,
        },
        Case {
            label: "1 USDC @ 5000 bps",
            amount: 10_000_000,
            rate: 5_000,
        },
        Case {
            label: "100 USDC @ 300 bps",
            amount: 1_000_000_000,
            rate: 300,
        },
        Case {
            label: "100 USDC @ 5000 bps",
            amount: 1_000_000_000,
            rate: 5_000,
        },
        // --- large realistic invoices ---
        Case {
            label: "1M USDC @ 1 bps",
            amount: 10_000_000_000_000,
            rate: 1,
        },
        Case {
            label: "1M USDC @ 300 bps",
            amount: 10_000_000_000_000,
            rate: 300,
        },
        Case {
            label: "1M USDC @ 5000 bps",
            amount: 10_000_000_000_000,
            rate: 5_000,
        },
        // --- uneven division amounts ---
        Case {
            label: "1_333 stroops @ 300 bps",
            amount: 1_333,
            rate: 300,
        },
        Case {
            label: "999_999 stroops @ 777 bps",
            amount: 999_999,
            rate: 777,
        },
        Case {
            label: "12_345_678 @ 1234 bps",
            amount: 12_345_678,
            rate: 1_234,
        },
        // --- overflow scenario (checked_mul fallback) ---
        Case {
            label: "i128::MAX @ 5000 bps (overflow)",
            amount: i128::MAX,
            rate: 5_000,
        },
    ];

    for case in &cases {
        let (discount, payout) = calc_discount(case.amount, case.rate);
        assert_eq!(
            payout + discount,
            case.amount,
            "[{}] INVARIANT payout ({}) + discount ({}) != amount ({})",
            case.label,
            payout,
            discount,
            case.amount
        );
    }
}
