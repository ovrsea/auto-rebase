import { debug, getInput, setFailed } from "@actions/core";
import { getOctokit } from "@actions/github";
import { handleError } from "./handle-error";

const isInMergeableState = ({ mergeable_state }: { mergeable_state: string }) =>
  mergeable_state === "clean";

const isRebasable = ({ mergeable_state }: { mergeable_state: string }) =>
  mergeable_state === "behind";

const run = async () => {
  const token = getInput("github_token", { required: true });
  const owner = getInput("github_owner", { required: true });
  const repo = getInput("github_repo", { required: true });

  const github = getOctokit(token);

  try {
    const pullRequests = await github.rest.pulls.list({
      direction: "desc",
      owner,
      repo,
      sort: "created",
      state: "open",
    });

    const detailedPullRequestsResponse = await Promise.all(
      pullRequests.data.map(async (pr) =>
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

    const oldestMergeablePullRequest =
      detailedPullRequests.find(isInMergeableState);
    const oldestRebasablePullRequest = detailedPullRequests.find(isRebasable);

    debug(`Number of opened PRs: ${detailedPullRequests.length}`);
    debug(JSON.stringify({ oldestMergeablePullRequest }, null, 2));
    debug(JSON.stringify({ oldestRebasablePullRequest }, null, 2));

    if (oldestMergeablePullRequest) {
      await github.rest.pulls.merge({
        owner,
        pull_number: oldestMergeablePullRequest.number,
        repo,
      });
    }

    if (oldestRebasablePullRequest) {
      await github.rest.pulls.updateBranch({
        owner,
        pull_number: oldestRebasablePullRequest.number,
        repo,
      });
    }
  } catch (error: unknown) {
    handleError(error, setFailed);
  }
};

void run();
