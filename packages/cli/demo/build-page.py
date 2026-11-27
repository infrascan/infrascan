"""Builds quickstart-demo.html: the asciinema player, the recording, and chapters found in the recording.

Chapter times are found by searching the recording for on-screen text, so they stay correct when timings change.
When the scenario changes, update CHAPTERS to match.
"""
import datetime
import json
import os
import re
import subprocess
import sys
import tarfile

DEMO_DIR = os.path.dirname(os.path.abspath(__file__))
CAST = os.path.join(DEMO_DIR, "quickstart.cast")
TEMPLATE = os.path.join(DEMO_DIR, "page.template.html")
OUTPUT = os.path.join(DEMO_DIR, "quickstart-demo.html")
CACHE = os.path.join(DEMO_DIR, ".cache")
PLAYER_VERSION = "3.8.2"
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")

# (text that appears on screen, which occurrence, title, detail)
CHAPTERS = [
    ("infrascan quickstart", 1, "Run the command", "No flags, so every choice is prompted for."),
    ("Where should infrascan", 1, "Choose a credential source",
     "Profile is preselected. Environment variables are greyed out because none are set."),
    ("Which profile", 1, "First account: production", "Each profile shows its default region."),
    ("Which regions", 1, "Choose its regions",
     "Credentials are checked first. us-east-1, production's region, is already ticked; eu-west-1 is added."),
    ("Add another account", 1, "Add a second account", "The same steps again, for staging and its region."),
    ("Save this environment", 1, "Save the environment",
     "Written in the scan config format, so infrascan scan -c and quickstart -c can reuse it."),
    ("Scanning an environment", 1, "Scan both accounts",
     "One status line updates in place with the account, region and service. Each finished region gets a tick."),
    ("Built graph", 1, "One graph for the environment",
     "Visual and informational graphs covering both accounts, plus a log of everything the scan printed."),
    ("cat infrascan-environment.json", 1, "The saved environment", "Each account with its profile and regions."),
]


def player_css():
    """The player's stylesheet, inlined because the artifact host only allows external scripts."""
    package_dir = os.path.join(CACHE, f"asciinema-player-{PLAYER_VERSION}")
    css = os.path.join(package_dir, "package", "dist", "bundle", "asciinema-player.css")
    if not os.path.exists(css):
        os.makedirs(package_dir, exist_ok=True)
        tarball = subprocess.run(
            ["npm", "pack", f"asciinema-player@{PLAYER_VERSION}", "--silent"],
            cwd=package_dir, check=True, capture_output=True, text=True,
        ).stdout.strip().splitlines()[-1]
        with tarfile.open(os.path.join(package_dir, tarball)) as archive:
            member = "package/dist/bundle/asciinema-player.css"
            if hasattr(tarfile, "data_filter"):
                archive.extract(member, package_dir, filter="data")
            else:
                archive.extract(member, package_dir)
    with open(css) as handle:
        return handle.read()


def find_chapters(cast_text):
    events = [json.loads(line) for line in cast_text.splitlines()[1:]]
    screen, chapters, found = "", [], {}
    pending = list(CHAPTERS)
    for time, kind, data in events:
        if kind != "o":
            continue
        screen += ANSI.sub("", data)
        for chapter in list(pending):
            text, occurrence, title, detail = chapter
            if screen.count(text) >= occurrence:
                chapters.append({"t": round(time, 1), "title": title, "detail": detail})
                pending.remove(chapter)
    if pending:
        missing = ", ".join(repr(text) for text, *_ in pending)
        sys.exit(f"build-page: chapters not found in the recording: {missing}")
    return sorted(chapters, key=lambda c: c["t"])


def main():
    with open(CAST) as handle:
        cast_text = handle.read()
    header = json.loads(cast_text.splitlines()[0])
    chapters = find_chapters(cast_text)
    duration = json.loads(cast_text.splitlines()[-1])[0]
    # Rest on the end of the quickstart run, so the first frame shows the result.
    poster = next(c["t"] for c in chapters if c["title"] == "One graph for the environment") + 0.5
    cast = {"data": cast_text, "cols": header["width"], "rows": header["height"], "poster": poster}
    recorded = datetime.date.fromtimestamp(header["timestamp"]).isoformat()

    with open(TEMPLATE) as handle:
        page = handle.read()
    page = (
        page.replace("/*PLAYER_CSS*/", player_css())
        .replace("/*CAST_JSON*/", json.dumps(cast).replace("</", "<\\/"))
        .replace("/*CHAPTERS_JSON*/", json.dumps(chapters))
        .replace("/*RECORDED_DATE*/", recorded)
    )
    with open(OUTPUT, "w") as handle:
        handle.write(page)
    print(f"Wrote {os.path.relpath(OUTPUT)} ({duration:.0f}s recording, {len(chapters)} chapters)")


if __name__ == "__main__":
    main()
