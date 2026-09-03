interface HeapEntry {
  id: number;
  value: number;
}

type ComesBefore = (left: HeapEntry, right: HeapEntry) => boolean;

class BinaryHeap {
  private readonly values: HeapEntry[] = [];

  constructor(private readonly comesBefore: ComesBefore) {}

  get length(): number {
    return this.values.length;
  }

  peek(): HeapEntry | undefined {
    return this.values[0];
  }

  push(value: HeapEntry): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.comesBefore(value, this.values[parent]!)) break;
      this.values[index] = this.values[parent]!;
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): HeapEntry | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (first === undefined || last === undefined || this.values.length === 0) {
      return first;
    }
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      let child = left;
      if (
        right < this.values.length &&
        this.comesBefore(this.values[right]!, this.values[left]!)
      ) {
        child = right;
      }
      if (!this.comesBefore(this.values[child]!, last)) break;
      this.values[index] = this.values[child]!;
      index = child;
    }
    this.values[index] = last;
    return first;
  }
}

function compare(left: HeapEntry, right: HeapEntry): number {
  return left.value - right.value || left.id - right.id;
}

class SlidingMedian {
  private readonly lower = new BinaryHeap(
    (left, right) => compare(left, right) > 0,
  );
  private readonly upper = new BinaryHeap(
    (left, right) => compare(left, right) < 0,
  );
  private readonly removed = new Set<number>();
  private lowerSize = 0;
  private upperSize = 0;

  add(entry: HeapEntry): void {
    this.prune(this.lower);
    const lowerTop = this.lower.peek();
    if (lowerTop === undefined || compare(entry, lowerTop) <= 0) {
      this.lower.push(entry);
      this.lowerSize += 1;
    } else {
      this.upper.push(entry);
      this.upperSize += 1;
    }
    this.rebalance();
  }

  remove(entry: HeapEntry): void {
    this.prune(this.lower);
    const lowerTop = this.lower.peek();
    if (lowerTop !== undefined && compare(entry, lowerTop) <= 0) {
      this.lowerSize -= 1;
    } else {
      this.upperSize -= 1;
    }
    this.removed.add(entry.id);
    this.prune(this.lower);
    this.prune(this.upper);
    this.rebalance();
  }

  median(): number {
    this.prune(this.lower);
    const value = this.lower.peek()?.value;
    if (value === undefined)
      throw new Error("Cannot take the median of an empty window");
    return value;
  }

  private prune(heap: BinaryHeap): void {
    while (heap.length > 0) {
      const top = heap.peek()!;
      if (!this.removed.delete(top.id)) break;
      heap.pop();
    }
  }

  private rebalance(): void {
    if (this.lowerSize > this.upperSize + 1) {
      this.upper.push(this.lower.pop()!);
      this.lowerSize -= 1;
      this.upperSize += 1;
      this.prune(this.lower);
    } else if (this.lowerSize < this.upperSize) {
      this.lower.push(this.upper.pop()!);
      this.lowerSize += 1;
      this.upperSize -= 1;
      this.prune(this.upper);
    }
  }
}

export function medianFilterNearest(
  values: Float64Array,
  oddWindowSize: number,
): Float64Array {
  if (
    !Number.isInteger(oddWindowSize) ||
    oddWindowSize < 1 ||
    oddWindowSize % 2 === 0
  ) {
    throw new Error("Median filter window must be a positive odd integer");
  }
  if (values.length === 0 || oddWindowSize === 1) return values.slice();
  const radius = Math.floor(oddWindowSize / 2);
  const result = new Float64Array(values.length);
  const windows = new SlidingMedian();
  const valueAt = (position: number): number =>
    values[Math.max(0, Math.min(values.length - 1, position))]!;
  const entryAt = (position: number): HeapEntry => ({
    id: position + radius,
    value: valueAt(position),
  });
  for (let position = -radius; position <= radius; position += 1) {
    windows.add(entryAt(position));
  }
  for (let index = 0; index < values.length; index += 1) {
    result[index] = windows.median();
    if (index + 1 < values.length) {
      windows.remove(entryAt(index - radius));
      windows.add(entryAt(index + radius + 1));
    }
  }
  return result;
}
