// Mini cache for infrascan state
export default class Cache<T> {
  sizeLimit: number;

  size: number;

  state: Record<string, T>;

  keyOrders: Array<string>;

  constructor(maxSize: number) {
    if (maxSize < 1) {
      throw new Error("Cannot create a cache with a size less than 1");
    }
    this.sizeLimit = maxSize;
    this.size = 0;
    this.state = {};
    this.keyOrders = [];
  }

  set(key: string, val: T) {
    if (this.size === this.sizeLimit) {
      const keyToRemove = this.keyOrders.shift() as string;
      delete this.state[keyToRemove];
      this.size -= 1;
    }
    this.keyOrders.push(key);
    this.state[key] = val;
    this.size += 1;
  }

  get(key: string): T | undefined {
    return this.state[key];
  }

  has(key: string): boolean {
    return this.state[key] != null;
  }
}
