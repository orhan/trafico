const debug = require("debug")("probot:auto-pr-labeler");
const Raven = require("raven");
const AutoLabeler = require("./lib/auto-pr-labeler");

Raven.config(
  process.env.NODE_ENV === "production" &&
    "https://dce36edab6334112b02122e07b2bc549@sentry.io/1222067"
).install();

function probotPlugin(robot) {
  const events = [
    "pull_request.opened",
    "pull_request.closed",
    "pull_request.edited",
    "pull_request.synchronize",
    "pull_request.reopened",
    "pull_request_review.submitted",
    "pull_request_review.dismissed"
  ];

  robot.on(events, runAutoLabeler);
}

async function runAutoLabeler(context) {
  const autoLabeler = forRepository(context);
  const pullRequest = getPullRequest(context);
  const config = getConfig(context);

  Raven.context(() => {
    Raven.setContext({
      extra: {
        owner: context.repo()["owner"],
        repo: context.repo()["repo"],
        number: pullRequest.number
      }
    });
    autoLabeler.runAutoLabeler(pullRequest, config);
  });
}

function forRepository(context) {
  const config = Object.assign({}, context.repo({ logger: debug }));
  return new AutoLabeler(context.github, config);
}

function getPullRequest(context) {
  return context.payload.pull_request || context.payload.review.pull_request;
}

async function getConfig(context) {
  return await context.config('auto_pr_labeler.yml');
}

module.exports = probotPlugin;
