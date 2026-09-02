import { describe, expect, it } from "vitest";
import {
  addFractions,
  compareFractions,
  divideFractions,
  fraction,
  fractionsEqual,
  multiplyFractions,
  normalizeFraction,
  subtractFractions,
} from "../src/score";

describe("Fraction", () => {
  it("normalizes signs, gcd, and zero", () => {
    expect(normalizeFraction({ numerator: 6, denominator: -8 })).toEqual({
      numerator: -3,
      denominator: 4,
    });
    expect(normalizeFraction({ numerator: 0, denominator: -99 })).toEqual({
      numerator: 0,
      denominator: 1,
    });
  });

  it("compares and performs exact arithmetic", () => {
    expect(addFractions(fraction(1, 3), fraction(1, 6))).toEqual(
      fraction(1, 2),
    );
    expect(subtractFractions(fraction(1, 3), fraction(1, 2))).toEqual(
      fraction(-1, 6),
    );
    expect(multiplyFractions(fraction(3, 4), fraction(2, 9))).toEqual(
      fraction(1, 6),
    );
    expect(divideFractions(fraction(3, 4), fraction(9, 2))).toEqual(
      fraction(1, 6),
    );
    expect(compareFractions(fraction(2, 6), fraction(1, 3))).toBe(0);
    expect(fractionsEqual(fraction(7, 8), fraction(21, 24))).toBe(true);
  });

  it("rejects invalid and unsafe values", () => {
    expect(() => fraction(1, 0)).toThrow(RangeError);
    expect(() => fraction(Number.MAX_SAFE_INTEGER + 1, 1)).toThrow(RangeError);
    expect(() => divideFractions(fraction(1), fraction(0))).toThrow(RangeError);
  });
});
