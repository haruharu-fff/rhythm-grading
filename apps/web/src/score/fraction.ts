import type { Fraction } from "../domain";

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

function gcdBigInt(a: bigint, b: bigint): bigint {
  let left = a < 0n ? -a : a;
  let right = b < 0n ? -b : b;
  while (right !== 0n) {
    [left, right] = [right, left % right];
  }
  return left;
}

function safeNumber(value: bigint, label: string): number {
  if (value > MAX_SAFE_BIGINT || value < MIN_SAFE_BIGINT) {
    throw new RangeError(`${label} exceeds the safe integer range`);
  }
  return Number(value);
}

function fromBigInts(numerator: bigint, denominator: bigint): Fraction {
  if (denominator === 0n) {
    throw new RangeError("Fraction denominator must not be zero");
  }
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  if (numerator === 0n) {
    return { numerator: 0, denominator: 1 };
  }
  const divisor = gcdBigInt(numerator, denominator);
  return {
    numerator: safeNumber(numerator / divisor, "Fraction numerator"),
    denominator: safeNumber(denominator / divisor, "Fraction denominator"),
  };
}

export function normalizeFraction(value: Fraction): Fraction {
  if (
    !Number.isSafeInteger(value.numerator) ||
    !Number.isSafeInteger(value.denominator)
  ) {
    throw new RangeError("Fraction components must be safe integers");
  }
  return fromBigInts(BigInt(value.numerator), BigInt(value.denominator));
}

export function fraction(numerator: number, denominator = 1): Fraction {
  return normalizeFraction({ numerator, denominator });
}

export function addFractions(left: Fraction, right: Fraction): Fraction {
  const a = normalizeFraction(left);
  const b = normalizeFraction(right);
  return fromBigInts(
    BigInt(a.numerator) * BigInt(b.denominator) +
      BigInt(b.numerator) * BigInt(a.denominator),
    BigInt(a.denominator) * BigInt(b.denominator),
  );
}

export function subtractFractions(left: Fraction, right: Fraction): Fraction {
  const b = normalizeFraction(right);
  return addFractions(left, {
    numerator: -b.numerator,
    denominator: b.denominator,
  });
}

export function multiplyFractions(left: Fraction, right: Fraction): Fraction {
  const a = normalizeFraction(left);
  const b = normalizeFraction(right);
  return fromBigInts(
    BigInt(a.numerator) * BigInt(b.numerator),
    BigInt(a.denominator) * BigInt(b.denominator),
  );
}

export function divideFractions(left: Fraction, right: Fraction): Fraction {
  const b = normalizeFraction(right);
  if (b.numerator === 0) {
    throw new RangeError("Cannot divide by zero");
  }
  return multiplyFractions(left, {
    numerator: b.denominator,
    denominator: b.numerator,
  });
}

export function compareFractions(left: Fraction, right: Fraction): -1 | 0 | 1 {
  const a = normalizeFraction(left);
  const b = normalizeFraction(right);
  const leftProduct = BigInt(a.numerator) * BigInt(b.denominator);
  const rightProduct = BigInt(b.numerator) * BigInt(a.denominator);
  return leftProduct < rightProduct ? -1 : leftProduct > rightProduct ? 1 : 0;
}

export function fractionsEqual(left: Fraction, right: Fraction): boolean {
  return compareFractions(left, right) === 0;
}

export function fractionToNumber(value: Fraction): number {
  const normalized = normalizeFraction(value);
  return normalized.numerator / normalized.denominator;
}

export function fractionKey(value: Fraction): string {
  const normalized = normalizeFraction(value);
  return `${normalized.numerator}/${normalized.denominator}`;
}
