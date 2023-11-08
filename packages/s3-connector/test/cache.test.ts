import t from "tap";
import Cache from "../src/cache";

t.test("Cache cannot be size 0", (tap) => {
  try {
    const cache = new Cache(0);
    tap.fail("Cache was created with 0 capacity");
  } catch (err: unknown) {
    if (err instanceof Error) {
      tap.equal(err.message, "Cannot create a cache with a size less than 1");
    } else {
      tap.fail("Unknown error type thrown");
    }
  }
  tap.end();
});

t.test("Cache starts out empty", (tap) => {
  const cache = new Cache(1);
  const result = cache.get("not-defined");
  tap.equal(result, undefined);
  tap.end();
});

t.test("Set keys can be read from the cache", (tap) => {
  const cache = new Cache(1);

  const testValue = 10;
  const initialValue = cache.get("test-key");
  tap.equal(initialValue, undefined);
  cache.set("test-key", testValue);
  const postSetValue = cache.get("test-key");
  tap.equal(postSetValue, testValue);
  tap.end();
});

t.test(
  "Has correctly returns true for set keys, and false for unset",
  (tap) => {
    const cache = new Cache(1);
    const testValue = 10;
    const initialState = cache.has("test-key");
    tap.equal(initialState, false);
    cache.set("test-key", testValue);
    const postSetState = cache.has("test-key");
    tap.equal(postSetState, true);
    tap.end();
  },
);

t.test("Cache is FIFO - first set keys are evicted at capacity", (tap) => {
  const cache = new Cache(2);
  const testValue1 = 1;
  cache.set("test-key-1", testValue1);
  const testValue2 = 2;
  cache.set("test-key-2", testValue2);
  tap.equal(cache.has("test-key-1"), true);
  tap.equal(cache.has("test-key-2"), true);
  const testValue3 = 3;
  cache.set("test-key-3", testValue3);
  // Items 2 and 3 remain, with key 1 being evicted
  tap.equal(cache.has("test-key-1"), false);
  tap.equal(cache.has("test-key-2"), true);
  tap.equal(cache.has("test-key-3"), true);
  tap.end();
});
