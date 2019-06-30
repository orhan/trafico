const debug = require("debug")("probot:trafico");
const Raven = require("raven");
const Trafico = require("./lib/trafico");

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
    "pull_request.review_requested",
    "pull_request_review.edited",
    "pull_request_review.submitted",
    "pull_request_review.dismissed"
  ];

  robot.on(events, runTrafico);
}

async function runTrafico(context) {
  const trafico = forRepository(context);
  const pullRequest = getPullRequest(context);
  const config = await getConfig(context);

  trafico.runTrafico(context, pullRequest, config);
}

function forRepository(context) {
  const config = Object.assign({}, context.repo({ logger: debug }));
  return new Trafico(context.github, config);
}

function getPullRequest(context) {
  return context.payload.pull_request || context.payload.review.pull_request;
}

async function getConfig(context) {
  return await context.config("trafico.yml");
}

module.exports = probotPlugin;
