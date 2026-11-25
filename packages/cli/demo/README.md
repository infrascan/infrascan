# quickstart demo

A scripted recording of `infrascan quickstart`, made with [asciinema](https://asciinema.org). Re-record it whenever the command's prompts or output change, so the demo matches the current CLI.

```sh
pip install asciinema   # once
./record.sh
```

This builds the CLI, starts a fake AWS endpoint, records `scenario.py` into `quickstart.cast`, and builds `quickstart-demo.html`, a page with the asciinema player and chapter links.

- `fake-aws.mjs`: a stand-in for the AWS APIs. Each access key in `home/.aws/credentials` maps to its own account, with a small example app in every region. No real AWS account is used.
- `scenario.py`: types the commands and answers the prompts. It waits for text to appear before pressing keys, so if a prompt's wording changes, update its `STEPS`.
- `build-page.py`: finds the chapter times by searching the recording for on-screen text. Update `CHAPTERS` when the scenario changes.

To play the recording in a terminal:

```sh
asciinema play quickstart.cast
```
