import { format } from "util";
import type { Writable } from "stream";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

const CLEAR_LINE = "\r\x1b[2K";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

/**
 * A single status line which is rewritten in place on a TTY. Permanent lines can be printed above it with `log`.
 *
 * When the stream is not a TTY, in-place updates are dropped and only permanent lines are written,
 * so piped output stays readable.
 */
export class ProgressLine {
  readonly #stream: NodeJS.WriteStream;

  readonly #interactive: boolean;

  #text = "";

  #frame = 0;

  #timer: NodeJS.Timeout | undefined;

  readonly #onSigint = () => {
    this.stop();
    process.exit(130);
  };

  constructor(stream: NodeJS.WriteStream = process.stdout) {
    this.#stream = stream;
    this.#interactive = Boolean(stream.isTTY) && process.env.TERM !== "dumb";
  }

  get isInteractive(): boolean {
    return this.#interactive;
  }

  /**
   * Replaces the text of the status line.
   */
  update(text: string) {
    this.#text = text;
    if (!this.#interactive) {
      return;
    }
    if (this.#timer == null) {
      this.#stream.write(HIDE_CURSOR);
      // Ensure the cursor is restored if the user interrupts a long running scan.
      process.once("SIGINT", this.#onSigint);
      this.#timer = setInterval(() => {
        this.#frame = (this.#frame + 1) % SPINNER_FRAMES.length;
        this.#render();
      }, SPINNER_INTERVAL_MS);
      this.#timer.unref();
    }
    this.#render();
  }

  /**
   * Prints a permanent line, keeping the status line (if any) beneath it.
   */
  log(text: string) {
    if (this.#interactive) {
      this.#stream.write(`${CLEAR_LINE}${text}\n`);
      if (this.#timer != null) {
        this.#render();
      }
    } else {
      this.#stream.write(`${text}\n`);
    }
  }

  /**
   * Removes the status line and stops the spinner.
   */
  stop() {
    if (this.#timer != null) {
      clearInterval(this.#timer);
      this.#timer = undefined;
      process.removeListener("SIGINT", this.#onSigint);
      this.#stream.write(`${CLEAR_LINE}${SHOW_CURSOR}`);
    }
  }

  succeed(text: string) {
    this.stop();
    this.log(`✔ ${text}`);
  }

  fail(text: string) {
    this.stop();
    this.log(`✖ ${text}`);
  }

  #render() {
    const line = `${SPINNER_FRAMES[this.#frame]} ${this.#text}`;
    // Lines which wrap can't be cleared with a carriage return, so trim to the terminal width.
    const width = this.#stream.columns || 80;
    const truncated =
      line.length > width - 1 ? `${line.slice(0, width - 2)}…` : line;
    this.#stream.write(`${CLEAR_LINE}${truncated}`);
  }
}

const CONSOLE_METHODS = [
  "log",
  "info",
  "warn",
  "error",
  "debug",
  "trace",
] as const;

/**
 * Redirects all console output into the given stream, so that verbose output from the SDK and its scanners
 * doesn't flood the terminal. Returns a function which restores the original console methods.
 */
export function redirectConsole(target: Writable): () => void {
  const originals = CONSOLE_METHODS.map((method) => [
    method,
    console[method],
  ]) as [(typeof CONSOLE_METHODS)[number], (...args: unknown[]) => void][];

  for (const method of CONSOLE_METHODS) {
    console[method] = (...args: unknown[]) => {
      target.write(
        `${new Date().toISOString()} ${method.toUpperCase()} ${format(
          ...args,
        )}\n`,
      );
    };
  }

  return () => {
    for (const [method, original] of originals) {
      console[method] = original;
    }
  };
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
