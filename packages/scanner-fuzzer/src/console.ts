import { format } from "util";

const INJECTED_MARKER = "(injected by fuzzer)";

/**
 * Run `fn` with console output silenced, returning what was written to
 * `console.warn` and `console.error`. The SDK reports recoverable problems
 * (unscannable roles, nodes it couldn't insert) there.
 *
 * Messages caused by errors the fuzzer injected deliberately are dropped. The
 * SDK reports a failed role scan as two calls, a description then the error,
 * so the message before an injected error is dropped too.
 */
export async function captureConsole(
  fn: () => Promise<void>,
): Promise<string[]> {
  const original = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    warn: console.warn,
    error: console.error,
  };
  const captured: string[] = [];
  const capture = (...args: unknown[]) => {
    captured.push(format(...args));
  };
  const silence = () => {};
  console.log = silence;
  console.info = silence;
  console.debug = silence;
  console.warn = capture;
  console.error = capture;
  try {
    await fn();
  } finally {
    Object.assign(console, original);
  }
  return captured.filter(
    (message, idx) =>
      !message.includes(INJECTED_MARKER) &&
      !captured[idx + 1]?.includes(INJECTED_MARKER),
  );
}
