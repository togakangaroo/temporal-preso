type AnyIterable<T> = Iterable<T> | AsyncIterable<T>;

function iteratorOf<T>(source: AnyIterable<T>) {
  return Symbol.asyncIterator in source
    ? source[Symbol.asyncIterator]()
    : source[Symbol.iterator]();
}

// Pairs items up until both sources run out, filling the shorter side with undefined.
export async function* zipLongest<A, B>(
  a: AnyIterable<A>,
  b: AnyIterable<B>,
): AsyncGenerator<[A | undefined, B | undefined], void, void> {
  const iteratorA = iteratorOf(a);
  const iteratorB = iteratorOf(b);

  while (true) {
    const stepA = await iteratorA.next();
    const stepB = await iteratorB.next();
    if (stepA.done && stepB.done) return;

    yield [
      stepA.done ? undefined : stepA.value,
      stepB.done ? undefined : stepB.value,
    ];
  }
}
