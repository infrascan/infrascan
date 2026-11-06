/* eslint-disable max-classes-per-file -- error types are grouped together */

/**
 * The error thrown when a call is made to fail, shaped like an AWS service exception.
 */
export class InjectedServiceError extends Error {
  readonly $fault = "client";

  readonly $metadata = { httpStatusCode: 403 };

  readonly $injected = true;

  constructor(operation: string) {
    super(
      `User is not authorized to perform ${operation} (injected by fuzzer)`,
    );
    this.name = "AccessDeniedException";
  }
}

export class CallBudgetExceededError extends Error {
  constructor(budget: number) {
    super(
      `More than ${budget} API calls in one iteration, a getter is likely paginating forever`,
    );
    this.name = "CallBudgetExceededError";
  }
}
