<h1 align="center">Trafico</h1>

<br/>

<p align="center">
  <img src="/public/assets/trafico.svg" width="160" alt="Trafico's logo, a traffic police officer" />
</p>

<h4 align="center">
  GitHub App built with <a href="https://github.com/probot/probot">Probot</a> that adds appropriate labels depending on a Pull Request's status.
</h4>

<h1> </h1>

<br/>

## Installation

Please follow the below steps to install quickly :rocket::

1. Go to the [Trafico Github App page](https://github.com/marketplace/trafico-pull-request-labeler/).
2. Click the **"Install it for free"** button down below.
3. Choose a repository.
4. Create `.github/trafico.yml` file with your settings (see `.github/trafico.sample.yml` for available settings).
5. That's it :sparkles:.

<br/>

## How it works

Only watches the most recent commit :eyes::.

- Adds a `WIP` label if title starts from `WIP`, `[WIP]` or `WIP:` (can be disabled).
- Adds a `Waiting for Review` label when the PR does not have any reviews yet.
- Adds a `Changes requested` label when the PR has been reviewed with requested changes.
- Adds a `Approved` label when the PR has been reviewed and got approved (as many times as the branch's protection setting dictates).
- Adds a `Merged` label when the PR has been merged.

<br/>

## Based on PRTriage Bot

This bot is based heavily on the [PR-Triage Bot](https://probot.github.io/apps/pr-triage/) by [Sam Yamashita](https://twitter.com/sota0805), so check that one if this one does not fulfill your needs.

<br/>

## Contributing

Please read [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

<br/>

## License

Trafico © [Orhan Sönmez](https://twitter.com/orhnsnmz). Released under the [Apache 2.0](LICENSE)<br/>
Authored and maintained by [Orhan Sönmez](https://github.com/orhan).
