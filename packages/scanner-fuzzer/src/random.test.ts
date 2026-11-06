import t from "tap";
import { Random, deriveSeed, normalizeSeed } from "./random";

t.test("the same seed produces the same sequence", async ({ same }) => {
  const a = new Random(42);
  const b = new Random(42);
  same(
    Array.from({ length: 20 }, () => a.next()),
    Array.from({ length: 20 }, () => b.next()),
  );
});

t.test("different seeds produce different sequences", async ({ not }) => {
  not(new Random(1).next(), new Random(2).next());
});

t.test("next stays within [0, 1)", async ({ ok }) => {
  const random = new Random(7);
  const values = Array.from({ length: 10000 }, () => random.next());
  ok(values.every((value) => value >= 0 && value < 1));
});

t.test("int covers its whole range roughly evenly", async ({ equal, ok }) => {
  const random = new Random(3);
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 40000; i += 1) {
    counts[random.int(4)] += 1;
  }
  equal(counts.length, 4);
  for (const count of counts) {
    ok(count > 9000 && count < 11000, `bucket count ${count}`);
  }
});

t.test("pick rejects an empty list", async ({ throws }) => {
  throws(() => new Random(1).pick([]), RangeError);
});

t.test("token has the requested length and alphabet", async ({ match }) => {
  match(new Random(9).token(12), /^[a-z0-9]{12}$/);
});

t.test(
  "seeds are normalized into the valid state range",
  async ({ equal, throws }) => {
    equal(normalizeSeed(0), 1);
    equal(normalizeSeed(2147483647), 1);
    equal(normalizeSeed(-1), 2147483646);
    equal(normalizeSeed(5.9), 5);
    throws(() => normalizeSeed(Number.NaN), RangeError);
  },
);

t.test(
  "derived seeds differ per iteration and per base seed",
  async ({ equal }) => {
    const seeds = new Set<number>();
    for (let base = 1; base <= 10; base += 1) {
      for (let iteration = 0; iteration < 100; iteration += 1) {
        seeds.add(deriveSeed(base, iteration));
      }
    }
    equal(seeds.size, 1000);
  },
);
