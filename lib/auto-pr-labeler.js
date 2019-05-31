class AutoLabeler {
  constructor(github, { owner, repo, logger = console, ...config }) {
    this.github = github;
    this.logger = logger;
    this.config = Object.assign({}, require("./defaults"), config || {}, {
      owner,
      repo
    });
    this.pullRequest = {};
  }

  static get STATE() {
    return Object.freeze({
      WIP: "labelWip",
      UNREVIEWED: "labelUnreviewed",
      APPROVED: "labelApproved",
      CHANGES_REQUESTED: "labelChangesRequested",
      MERGED: "labelMerged"
    });
  }

  // see https://developer.github.com/v3/pulls/reviews/#create-a-pull-request-review
  static get GH_REVIEW_STATE() {
    return Object.freeze({
      APPROVED: "APPROVED",
      CHANGES_REQUESTED: "CHANGES_REQUESTED"
    });
  }

  async runAutoLabeler(pullRequest) {
    Object.assign(this.pullRequest, pullRequest);
    const { owner, repo } = this.config;
    const number = this.pullRequest.number;

    await this._ensureStatusLabelsExist();
    const state = await this._getState();

    switch (state) {
      case AutoLabeler.STATE.WIP:
      case AutoLabeler.STATE.UNREVIEWED:
      case AutoLabeler.STATE.CHANGES_REQUESTED:
      case AutoLabeler.STATE.APPROVED:
      case AutoLabeler.STATE.MERGED:
        this._updateLabel(state);
        this.logger(
          "%s/%s#%s is labeled as %s",
          owner,
          repo,
          number,
          Object.keys(AutoLabeler.STATE).find(k => {
            return AutoLabeler.STATE[k] === state;
          })
        );
        break;
      default:
        throw new Error("Undefined state");
    }
    
    if (this.config.reviewers) {
      await this._ensureReviewerLabelsExist();
      
      for (const reviewerUsername in Object.keys(this.config.reviewers)) {
        for (const assignee in this.pullRequest.assignees) {
          if (reviewerUsername === assignee) {
            const reviewerObj = this.config.reviewers[reviewerUsername];
            await this._updateLabel("reviewers", reviewerObj);
          }
        }
      }
    }
  }

  async _getState() {
    if (this.pullRequest.title.match(this._getConfigObj("wipRegex"))) {
      return AutoLabeler.STATE.WIP;
    } else if (this.pullRequest.state === "closed" && this.pullRequest.merged) {
      return AutoLabeler.STATE.MERGED;
    }

    const reviews = await this._getUniqueReviews();
    if (reviews.length === 0) {
      return AutoLabeler.STATE.UNREVIEWED;
    } else {
      const changeRequestedReviews = reviews.filter(
        review => review.state === AutoLabeler.GH_REVIEW_STATE.CHANGES_REQUESTED
      );
      const approvedReviews = reviews.filter(
        review => review.state === AutoLabeler.GH_REVIEW_STATE.APPROVED
      );

      if (changeRequestedReviews.length > 0) {
        return AutoLabeler.STATE.CHANGES_REQUESTED;
      } else if (reviews.length === approvedReviews.length) {
        return AutoLabeler.STATE.APPROVED;
      }
    }
  }

  async _getUniqueReviews() {
    const { owner, repo } = this.config;
    const number = this.pullRequest.number;
    const sha = this.pullRequest.head.sha;

    const reviews =
      (await this.github.pullRequests.listReviews({ owner, repo, number }))
        .data || [];

    const uniqueReviews = reviews
      .filter(review => review.commit_id === sha)
      .filter(
        review =>
          review.state === AutoLabeler.GH_REVIEW_STATE.APPROVED ||
          review.state === AutoLabeler.GH_REVIEW_STATE.CHANGES_REQUESTED
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

  async _ensureReviewerLabelsExist() {
    for (const reviewerObj in this.config.reviewers) {
      await this._createLabel("reviewers", reviewerObj);
    }
  }
  
  async _ensureStatusLabelsExist() {
    for (const labelObj in this._getFilteredConfigObjByRegex(/label_*/)) {
      await this._createLabel(labelObj);
    }
  }

  async _createLabel(key, subKey) {
    const { owner, repo } = this.config;
    const labelObj = this._getConfigObj(key, subKey);

    return this.github.issues
      .getLabel({ owner, repo, name: labelObj.name })
      .catch(() => {
        return this.github.issues.createLabel({
          owner,
          repo,
          name: labelObj.name,
          color: labelObj.color
        });
      });
  }

  async _addLabel(key, subKey) {
    const { owner, repo } = this.config;
    const number = this.pullRequest.number;
    const labelObj = this._getConfigObj(key, subKey);

    // Check if a label does not exist. If it does, it adds the label.
    return this._getLabel(key, subKey).catch(() => {
      return this.github.issues.addLabels({
        owner,
        repo,
        number,
        labels: [labelObj.name]
      });
    });
  }

  async _removeLabel(key, subKey) {
    const { owner, repo } = this.config;
    const number = this.pullRequest.number;
    const labelObj = this._getConfigObj(key, subKey);

    // Check if a label exists. If it does, it removes the label.
    return this._getLabel(key, subKey).then(
      labelObj => {
        return this.github.issues
          .removeLabel({ owner, repo, number, name: labelObj.name })
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

  async _updateLabel(labelKey, rootKey) {
    const currentLabelKey = await this._getCurrentLabelKey(rootKey);
    if (currentLabelKey) {
      if (labelKey === AutoLabeler.STATE.WIP && !this.config.addWipLabel) {
        if (rootKey) {
          this._removeLabel(rootKey, currentLabelKey);
        } else {
          this._removeLabel(currentLabelKey);
        }
      } else if (currentLabelKey !== labelKey) {
        if (rootKey) {
          this._removeLabel(rootKey, currentLabelKey);
          this._addLabel(rootKey, labelKey);
        } else {
          this._removeLabel(currentLabelKey);
          this._addLabel(labelKey);
        }
      }
    } else {
      if (labelKey !== AutoLabeler.STATE.WIP) {
        this._addLabel(labelKey);
      }
    }
  }

  _getLabel(key, subKey) {
    return new Promise((resolve, reject) => {
      for (const label of this.pullRequest.labels) {
        const labelObj = this._getConfigObj(key, subKey);
        if (labelObj && labelObj.name && label.name === labelObj.name) {
          resolve(labelObj);
        }
      }
      reject(new Error("Not found"));
    });
  }

  _getCurrentLabelKey(rootKey) {
    return this.pullRequest.labels
      .map(label => {
        const filteredConfig = this._getFilteredConfigObjByRegex(/label_*/, rootKey);
        for (const labelKey in filteredConfig) {
          const configValue = filteredConfig[labelKey];
          if (
            configValue &&
            configValue.name &&
            label.name === configValue.name
          ) {
            return labelKey;
          }
        }
      })
      .filter(key => key !== "undefined")[0];
  }

  _getFilteredConfigObjByRegex(regex, rootKey) {
    const root = rootKey ? this.config[rootKey] : this.config
    
    return Object.keys(root).reduce((result, key) => {
      if (regex.test(key)) {
        if (rootKey) {
          result[key] = this._getConfigObj(rootKey, key);
        } else {
          result[key] = this._getConfigObj(key);
        }
      }
      return result;
    }, {});
  }

  _getConfigObj(key, subKey) {
    if (!subKey) {
      return this.config[key];
    } else {
      return this.config[key][subKey];
    }
  }
}

module.exports = AutoLabeler;
