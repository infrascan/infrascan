import t from "tap";
import { captureConsole } from "./console";

t.test(
  "warnings and errors are captured, other output is silenced",
  async ({ same }) => {
    const captured = await captureConsole(async () => {
      console.log("noise");
      console.warn("Unknown role arn %s", "x");
      console.error("bad", 1);
    });
    same(captured, ["Unknown role arn x", "bad 1"]);
  },
);

t.test(
  "messages about injected errors are dropped, with their description",
  async ({ same }) => {
    const captured = await captureConsole(async () => {
      console.error("An error occurred while scanning role:", "arn");
      console.error("User is not authorized (injected by fuzzer)");
      console.error("An error occurred while scanning role:", "null");
      console.error("Cannot read properties of null");
    });
    same(captured, [
      "An error occurred while scanning role: null",
      "Cannot read properties of null",
    ]);
  },
);

t.test(
  "the console is restored even when the callback throws",
  async ({ equal, rejects }) => {
    const { warn } = console;
    await rejects(
      captureConsole(async () => {
        throw new Error("boom");
      }),
    );
    equal(console.warn, warn);
  },
);
