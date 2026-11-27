"""Scripted terminal session for the quickstart demo. record.sh runs this under `asciinema rec`.

Each command is typed at a fake prompt, then run in its own pseudo-terminal. Keys are only sent once the
expected text is on screen, so the script follows the CLI rather than fixed timings. When the CLI's prompts
change, update STEPS below (and the chapters in build-page.py).
"""
import fcntl
import os
import pty
import random
import re
import select
import struct
import sys
import termios
import time

DEMO_DIR = os.path.dirname(os.path.abspath(__file__))
CLI = os.path.join(DEMO_DIR, "..", "dist", "index.mjs")
WORKDIR = os.path.join(DEMO_DIR, "home", "acme-platform")
COLS, ROWS = int(os.environ.get("DEMO_COLS", "100")), int(os.environ.get("DEMO_ROWS", "28"))
PROMPT = "\x1b[1;32m~/acme-platform\x1b[0m \x1b[1;34m$\x1b[0m "
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
STEP_TIMEOUT_S = 60

UP, DOWN, ENTER, SPACE = "\x1b[A", "\x1b[B", "\r", " "

ENV = {
    "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
    "HOME": os.path.join(DEMO_DIR, "home"),
    "TERM": "xterm-256color",
    "LANG": "C.UTF-8",
    "AWS_ENDPOINT_URL": f"http://127.0.0.1:{os.environ.get('FAKE_AWS_PORT', '4599')}",
    "NO_PROXY": "127.0.0.1,localhost",
}


def out(text):
    sys.stdout.write(text)
    sys.stdout.flush()


def type_command(command):
    out(PROMPT)
    time.sleep(0.8)
    for char in command:
        out(char)
        time.sleep(random.uniform(0.04, 0.1))
    time.sleep(0.4)
    out("\r\n")


def run(args, steps=()):
    """Runs a command in a pseudo-terminal, echoing its output. Each step is (text to wait for, pause, keys)."""
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(WORKDIR)
        os.execvpe(args[0], args, ENV)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))
    screen = ""

    def pump(timeout):
        nonlocal screen
        ready, _, _ = select.select([fd], [], [], timeout)
        if not ready:
            return True
        try:
            data = os.read(fd, 65536).decode(errors="replace")
        except OSError:
            return False
        if not data:
            return False
        out(data)
        screen += ANSI.sub("", data)
        return True

    def wait(seconds):
        end = time.time() + seconds
        while time.time() < end:
            pump(0.02)

    for wait_for, pause, keys in steps:
        deadline = time.time() + STEP_TIMEOUT_S
        while wait_for not in screen:
            if time.time() > deadline or not pump(0.05):
                sys.stderr.write(f"\nscenario: gave up waiting for {wait_for!r}\n")
                os.kill(pid, 9)
                sys.exit(1)
        screen = screen[screen.index(wait_for) + len(wait_for):]
        wait(pause)
        for key in keys:
            os.write(fd, key.encode())
            wait(0.4)
    while pump(0.1):
        pass
    _, status = os.waitpid(pid, 0)
    return os.waitstatus_to_exitcode(status)


STEPS = [
    # Account 1: production, adding eu-west-1 to its preselected region (us-east-1).
    ("select", 1.8, [ENTER]),  # credential source: "Profile" is preselected
    ("Which profile should be used?", 0.2, []),
    ("select", 1.0, [DOWN, ENTER]),  # profiles: default, production, staging
    ("Which regions should be scanned?", 0.2, []),
    ("submit", 1.2, [DOWN, DOWN, SPACE, ENTER]),
    ("Add another account", 1.2, ["y", ENTER]),
    # Account 2: staging, keeping its preselected region (eu-west-1).
    ("select", 1.0, [ENTER]),
    ("Which profile should be used?", 0.2, []),
    ("select", 1.0, [DOWN, DOWN, ENTER]),
    ("Which regions should be scanned?", 0.2, []),
    ("submit", 1.2, [ENTER]),
    ("Add another account", 1.2, [ENTER]),  # no
    ("Save this environment", 1.2, ["y", ENTER]),
    ("Config file path", 1.0, [ENTER]),
    ("--browser", 0, []),
]


def main():
    for name in os.listdir(WORKDIR):
        if name != ".gitkeep":
            os.system(f"rm -rf '{os.path.join(WORKDIR, name)}'")
    time.sleep(0.5)
    type_command("infrascan quickstart")
    if run(["node", CLI, "quickstart"], STEPS) != 0:
        sys.exit(1)
    time.sleep(1.5)
    type_command("cat infrascan-environment.json")
    run(["cat", "infrascan-environment.json"])
    time.sleep(1.0)
    out(PROMPT)
    time.sleep(4.0)


if __name__ == "__main__":
    main()
