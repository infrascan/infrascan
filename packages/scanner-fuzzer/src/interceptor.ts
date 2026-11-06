import type { SchemaCommand } from "./generator";
import type { FuzzTransport } from "./transport";

type Send = (
  this: unknown,
  command: SchemaCommand,
  ...rest: unknown[]
) => Promise<unknown>;

interface SendPrototype {
  send: Send;
}

/**
 * Walk a client's prototype chain to the class that defines `send`. Every AWS
 * SDK v3 client inherits it from the Smithy base client.
 */
export function findSendPrototype(client: object): SendPrototype {
  let proto: object | null = Object.getPrototypeOf(client);
  while (proto != null) {
    if (Object.prototype.hasOwnProperty.call(proto, "send")) {
      return proto as SendPrototype;
    }
    proto = Object.getPrototypeOf(proto);
  }
  throw new TypeError("Object is not an AWS SDK client: no send method found");
}

/**
 * Routes every AWS SDK client's `send` to the current {@link FuzzTransport}
 * instead of the network, including the clients the SDK creates internally.
 */
export class TransportInterceptor {
  private readonly originals = new Map<SendPrototype, Send>();

  private transport?: FuzzTransport;

  /**
   * Intercept the base client of each given client. Clients built from the same
   * `@smithy/core` copy share one base, so this is usually a single prototype.
   */
  install(clients: object[]) {
    const dispatch = (command: SchemaCommand) => this.dispatch(command);
    for (const client of clients) {
      const proto = findSendPrototype(client);
      if (!this.originals.has(proto)) {
        this.originals.set(proto, proto.send);
        proto.send = function send(command: SchemaCommand, ...rest: unknown[]) {
          const result = dispatch(command);
          // Support the callback style signature: send(command, [options], callback)
          const callback = rest.find(
            (arg): arg is (err: unknown, data?: unknown) => void =>
              typeof arg === "function",
          );
          if (callback != null) {
            result.then(
              (data) => callback(null, data),
              (err) => callback(err),
            );
            return undefined as unknown as Promise<unknown>;
          }
          return result;
        };
      }
    }
  }

  use(transport: FuzzTransport) {
    this.transport = transport;
  }

  restore() {
    for (const [proto, original] of this.originals) {
      proto.send = original;
    }
    this.originals.clear();
    this.transport = undefined;
  }

  get installed(): number {
    return this.originals.size;
  }

  private dispatch(command: SchemaCommand): Promise<unknown> {
    if (this.transport == null) {
      // Never fall through to the network with fake credentials
      return Promise.reject(
        new Error("Fuzzer transport is installed but no iteration is active"),
      );
    }
    return this.transport.send(command);
  }
}
