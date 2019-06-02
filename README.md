
# Auto-PR-Labeler Bot

> GitHub App built with [Probot](https://github.com/probot/probot) that adds appropriate labels depending on the PR's status.

## Installation

Please follow the below steps to install quickly :rocket::

1. Go to [Auto-PR-Labeler-Bot App top page](https://probot.github.io/apps/auto-pr-labeler-bot/).
2. Click **"+ Add to GitHub"** button.
3. Choose a repository.
4. Create `.github/auto_pr_labeler.yml` file with your settings (see `.github/auto_pr_labeler.sample.yml` for available settings).
5. That's it :sparkles:.

## How it works

Only watches the most recent commit :eyes::.

- Adds a `WIP` label if title starts from `WIP`, `[WIP]` or `WIP:` (can be disabled).
- Adds a `Waiting for Review` label when the PR does not have any reviews yet.
- Adds a `Changes requested` label when the PR has been reviewed with requested changes.
- Adds a `Approved` label when the PR has been reviewed and got approved (as many times as the branch's protection setting dictates).
- Adds a `Merged` label when the PR has been merged.

## Based on PRTriage Bot

This bot is based heavily on the [PR-Triage Bot](https://probot.github.io/apps/pr-triage/) by [Sam Yamashita](https://twitter.com/sota0805), so check that one if this one does not fulfill your needs.

## Contributing

Please read [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## License

Auto-PR-Labeler-Bot © [Orhan Sönmez](https://twitter.com/orhnsnmz). Released under the [Apache 2.0](LICENSE)<br/>
Authored and maintained by [Orhan Sönmez](https://github.com/orhan).
