import type { ResponseGenerator, SchemaCommand } from "./generator";
import type { Random } from "./random";
import { CallBudgetExceededError, InjectedServiceError } from "./errors";

/**
 * Operations the SDK needs to start a scan. Failing them only proves the scan
 * can't start without credentials, so errors are never injected into them.
 */
const BOOTSTRAP_OPERATIONS = new Set(["GetCallerIdentity", "DescribeRegions"]);

/**
 * Answers API calls for one iteration from generated responses.
 */
export class FuzzTransport {
  private remainingCalls: number;

  private readonly budget: number;

  readonly calls = new Map<string, number>();

  constructor(
    private readonly generator: ResponseGenerator,
    private readonly random: Random,
    private readonly errorRate: number,
    budget = 5000,
  ) {
    this.budget = budget;
    this.remainingCalls = budget;
  }

  async send(command: SchemaCommand): Promise<unknown> {
    this.remainingCalls -= 1;
    if (this.remainingCalls < 0) {
      throw new CallBudgetExceededError(this.budget);
    }
    const { operation, response } = this.generator.respond(command);
    this.calls.set(operation, (this.calls.get(operation) ?? 0) + 1);
    if (
      !BOOTSTRAP_OPERATIONS.has(operation) &&
      this.random.chance(this.errorRate)
    ) {
      throw new InjectedServiceError(operation);
    }
    return { ...response, $metadata: { httpStatusCode: 200 } };
  }
}
