class Trafico {
  constructor(github, { owner, repo, logger = console, ...config }) {
    this.github = github;
    this.logger = logger;
    this.config = Object.assign({}, require("./defaults"), config || {}, {
      owner,
      repo
    });
    this.pullRequest = {};
  }

  static get STATUS() {
    return Object.freeze({
      WIP: "wip",
      UNREVIEWED: "unreviewed",
      APPROVED: "approved",
      CHANGES_REQUESTED: "changesRequested",
      MERGED: "merged"
    });
  }

  // see https://developer.github.com/v3/pulls/reviews/#create-a-pull-request-review
  static get GH_REVIEW_STATUS() {
    return Object.freeze({
      APPROVED: "APPROVED",
      CHANGES_REQUESTED: "CHANGES_REQUESTED"
    });
  }

  async runTrafico(context, pullRequest, config) {
    this.log = context.log;
    this.config = Object.assign({}, this.config, config);

    Object.assign(this.pullRequest, pullRequest);

    await this._ensureStatusLabelsExist();

    const statuses = await this._getStatuses();

    statuses.forEach(status => {
      switch (status) {
        case Trafico.STATUS.WIP:
          if (this.config.addWipLabel) {
            this._addStatusLabel(status);
          }
          break;
        case Trafico.STATUS.UNREVIEWED:
        case Trafico.STATUS.CHANGES_REQUESTED:
        case Trafico.STATUS.APPROVED:
        case Trafico.STATUS.MERGED:
          this._addStatusLabel(status);
          break;
        default:
          throw new Error("Undefined state");
      }
    });

    // Remove all labels except of the currently active one.
    await this._clearStatusLabels(statuses);

    if (this.config.reviewers) {
      let activeReviewers = [];

      await this._ensureReviewerLabelsExist();

      const assignedReviewers = await this._getReviewRequests();

      assignedReviewers.forEach(async assignedReviewer => {
        for (const user in this.config.reviewers) {
          if (user === assignedReviewer.login) {
            this._addUserLabel(user);
            activeReviewers.push(user);
          }
        }
      });

      this._clearReviewerLabels(activeReviewers);
    }
  }

  async _getStatuses() {
    const wipRegex = new RegExp(this.config.wipRegex);
    const title = this.pullRequest.title.replace(
      /([\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF])/g,
      ""
    );

    if (title.match(wipRegex)) {
      return [Trafico.STATUS.WIP];
    } else if (this.pullRequest.state === "closed" && this.pullRequest.merged) {
      return [Trafico.STATUS.MERGED];
    }

    const reviews = await this._getUniqueReviews();
    if (reviews.length === 0) {
      return [Trafico.STATUS.UNREVIEWED];
    } else {
      const changeRequestedReviews = reviews.filter(
        review => review.state === Trafico.GH_REVIEW_STATUS.CHANGES_REQUESTED
      );
      const approvedReviews = reviews.filter(
        review => review.state === Trafico.GH_REVIEW_STATUS.APPROVED
      );

      if (changeRequestedReviews.length > 0) {
        return [Trafico.STATUS.CHANGES_REQUESTED];
      } else if (reviews.length === approvedReviews.length) {
        const statuses = [Trafico.STATUS.APPROVED];

        const requiredApprovals = await this._getMinimumRequiredApprovals(
          this.pullRequest.base.ref
        );

        if (approvedReviews.length < requiredApprovals) {
          status.push(Trafico.STATUS.UNREVIEWED);
        }

        return statuses;
      }
    }
  }

  async _getMinimumRequiredApprovals(branch) {
    const { owner, repo } = this.config;

    return new Promise(resolve => {
      this.github.repos
        .getBranchProtection({
          owner,
          repo,
          branch,
          mediaType: {
            previews: ["luke-cage"]
          }
        })
        .then(response => {
          if (
            response.data.required_pull_request_reviews &&
            response.data.required_pull_request_reviews
              .required_approving_review_count
          ) {
            resolve(
              response.data.required_pull_request_reviews
                .required_approving_review_count
            );
          } else {
            resolve(0);
          }
        })
        .catch(() => {
          resolve(0);
        });
    });
  }

  async _getUniqueReviews() {
    const { owner, repo } = this.config;
    const number = this.pullRequest.number;
    const sha = this.pullRequest.head.sha;

    const reviews =
      (await this.github.pullRequests.listReviews({
        owner,
        repo,
        pull_number: number
      })).data || [];

    const uniqueReviews = reviews
      .filter(review => review.commit_id === sha)
      .filter(
        review =>
          review.state === Trafico.GH_REVIEW_STATUS.APPROVED ||
          review.state === Trafico.GH_REVIEW_STATUS.CHANGES_REQUESTED
      )
      .reduce((reviewObj, review) => {
        if (
          reviewObj[review.user.id] === null ||
          reviewObj[review.user.id] === undefined
        ) {
          reviewObj[review.user.id] = {
            state: review.state,
            submitted_at: review.submitted_at
          };
        } else {
          const a = new Date(
            reviewObj[review.user.id]["submitted_at"]
          ).getTime();
          const b = new Date(review.submitted_at).getTime();
          if (a < b) {
            reviewObj[review.user.id] = {
              state: review.state,
              submitted_at: review.submitted_at
            };
          }
        }
        return reviewObj;
      }, {});

    return Object.values(uniqueReviews);
  }

  async _getReviewRequests() {
    const { owner, repo } = this.config;
    const number = this.pullRequest.number;

    return (await this.github.pullRequests.listReviewRequests({
      owner,
      repo,
      pull_number: number
    })).data.users;
  }

  async _ensureReviewerLabelsExist() {
    for (const key in this.config.reviewers) {
      const reviewer = this.config.reviewers[key];
      await this._createLabel(
        reviewer.name,
        reviewer.color,
        "Pull Request Reviews assigned to GitHub User: " + key
      );
    }
  }

  async _ensureStatusLabelsExist() {
    for (const key in this.config.labels) {
      const label = this.config.labels[key];
      await this._createLabel(label.name, label.color, label.description);
    }
  }

  async _createLabel(name, color, description) {
    const { owner, repo } = this.config;

    return this.github.issues
      .getLabel({ owner, repo, name: name })
      .then(response => {
        const currentLabel = response.data;
        const newColor = color.indexOf("#") === 0 ? color.substring(1) : color;

        if (
          currentLabel.color !== newColor ||
          currentLabel.description !== description
        ) {
          return this.github.issues.updateLabel({
            owner,
            repo,
            current_name: name,
            name: name,
            color: newColor,
            description: description,
            headers: { accept: "application/vnd.github.symmetra-preview+json" }
          });
        }
      })
      .catch(() => {
        return this.github.issues.createLabel({
          owner,
          repo,
          name: name,
          color: color.indexOf("#") === 0 ? color.substring(1) : color,
          description: description,
          headers: { accept: "application/vnd.github.symmetra-preview+json" }
        });
      });
  }

  async _addStatusLabel(status) {
    const { owner, repo } = this.config;
    const number = this.pullRequest.number;
    const label = this.config.labels[status];

    // Check if a label does not exist. If it does, it adds the label.
    await this.github.issues
      .addLabels({
        owner,
        repo,
        issue_number: number,
        labels: [label.name]
      })
      .catch(error => {
        if (error.code !== 404) {
          throw error;
        }
      });
  }

  async _addUserLabel(user) {
    const { owner, repo } = this.config;
    const number = this.pullRequest.number;
    const label = this.config.reviewers[user];

    await this.github.issues
      .addLabels({
        owner,
        repo,
        issue_number: number,
        labels: [label.name]
      })
      .catch(error => {
        if (error.code !== 404) {
          throw error;
        }
      });
  }

  async _clearStatusLabels(activeStatuses) {
    const { owner, repo } = this.config;
    const number = this.pullRequest.number;

    for (const key in this.config.labels) {
      if (activeStatuses.indexOf(key) === -1) {
        const label = this.config.labels[key];

        await this.github.issues
          .removeLabel({ owner, repo, issue_number: number, name: label.name })
          .catch(error => {
            if (error.code !== 404) {
              throw error;
            }
          });
      }
    }
  }

  async _clearReviewerLabels(activeReviewers) {
    const { owner, repo } = this.config;
    const number = this.pullRequest.number;

    for (const key in this.config.reviewers) {
      if (activeReviewers.indexOf(key) === -1) {
        const label = this.config.reviewers[key];

        await this.github.issues
          .removeLabel({ owner, repo, issue_number: number, name: label.name })
          .catch(error => {
            if (error.code !== 404) {
              throw error;
            }
          });
      }
    }
  }

  async _removeLabel(state) {
    const { owner, repo } = this.config;
    const number = this.pullRequest.number;

    // Check if a label exists. If it does, it removes the label.
    return this._getLabel(state).then(
      stateLabel => {
        return this.github.issues
          .removeLabel({ owner, repo, number, name: stateLabel.name })
          .catch(err => {
            // Ignore if it's a 404 because then the label was already removed
            if (err.code !== 404) {
              throw err;
            }
          });
      },
      () => {}
    ); // Do nothing for error handling.
  }

  async _updateLabel(status) {
    if (status !== Trafico.STATUS.WIP || this.config.addWipLabel) {
      this._addStatusLabel(status);
    }
  }
}

module.exports = Trafico;
