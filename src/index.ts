import { debug, getInput, setFailed } from "@actions/core";
import { getOctokit } from "@actions/github";
import { handleError } from "./handle-error";

const isInMergeableState = ({
  draft,
  mergeable_state,
}: {
  draft?: boolean;
  mergeable_state: string;
}) => !draft && mergeable_state === "clean";

const isRebasable = ({
  draft,
  mergeable_state,
}: {
  draft?: boolean;
  mergeable_state: string;
}) => !draft && mergeable_state === "behind";

const run = async () => {
  const token = getInput("github_token", { required: true });
  const owner = getInput("github_owner", { required: true });
  const repo = getInput("github_repo", { required: true });

  const github = getOctokit(token);

  try {
    const pullRequests = await github.rest.search.issuesAndPullRequests({
      order: "asc",
      q: `is:pr is:open repo:${owner}/${repo} review:approved base:prod`,
      sort: "created",
    });

    const detailedPullRequestsResponse = await Promise.all(
      pullRequests.data.items.map(async (pr) =>
        github.rest.pulls.get({
          owner,
          pull_number: pr.number,
          repo,
        })
      )
    );

    const detailedPullRequests = detailedPullRequestsResponse.map(
      ({ data }) => data
    );

    const rebasablePullRequests = detailedPullRequests.filter(isRebasable);

    const oldestMergeablePullRequest =
      detailedPullRequests.find(isInMergeableState);
    const oldestRebasablePullRequests = rebasablePullRequests.slice(2);

    debug(`Number of opened PRs: ${detailedPullRequests.length}`);
    debug(JSON.stringify({ oldestMergeablePullRequest }, null, 2));
    debug(JSON.stringify({ oldestRebasablePullRequests }, null, 2));

    if (oldestMergeablePullRequest) {
      await github.rest.pulls.merge({
        merge_method: "squash",
        owner,
        pull_number: oldestMergeablePullRequest.number,
        repo,
      });
    }

    if (oldestRebasablePullRequests.length > 0) {
      await Promise.all(
        oldestRebasablePullRequests.map(async (pullRequest) =>
          github.rest.pulls.updateBranch({
            owner,
            pull_number: pullRequest.number,
            repo,
          })
        )
      );
    }
  } catch (error: unknown) {
    handleError(error, setFailed);
  }
};

void run();
