import { debug, getInput, setFailed } from "@actions/core";
import { getOctokit } from "@actions/github";
import { handleError } from "./handle-error";

const isInMergeableState = ({ mergeable_state }: { mergeable_state: string }) =>
  mergeable_state === "clean";

const isRebasable = ({ mergeable_state }: { mergeable_state: string }) =>
  mergeable_state === "behind"

const run = async () => {
  const token = getInput("github_token", { required: true });
  const owner = getInput("github_owner", { required: true });
  const repo = getInput("github_repo", { required: true });

  const github = getOctokit(token);

  try {
    const pullRequests = await github.rest.pulls.list({
      direction: "asc",
      owner,
      repo,
      sort: "created",
      state: "open",
    });

    const detailedPullRequestsResponse = await Promise.all(
      pullRequests.data.map(async (pr) => github.rest.pulls.get({
        owner,
        pull_number: pr.number,
        repo,
      }))
    )

    const detailedPullRequests = detailedPullRequestsResponse.map(({ data }) => data);

    const firstMergeablePullRequest = detailedPullRequests.find(isInMergeableState);
    const firstRebasablePullRequest = detailedPullRequests.find(isRebasable);

    debug(JSON.stringify({ detailedPullRequests }, null, 2));
    debug(JSON.stringify({ firstMergeablePullRequest }, null, 2));
    debug(JSON.stringify({ firstRebasablePullRequest }, null, 2));

    if (firstMergeablePullRequest) {
      await github.rest.pulls.merge({
        owner,
        pull_number: firstMergeablePullRequest.number,
        repo,
      })
    }

    if (firstRebasablePullRequest) {
      await github.rest.pulls.updateBranch({
        owner,
        pull_number: firstRebasablePullRequest.number,
        repo,
      })
    }
  } catch (error: unknown) {
    handleError(error, setFailed);
  }
};

void run();
