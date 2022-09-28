import { debug, getInput, setFailed } from "@actions/core";
import { getOctokit } from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils";
import { handleError } from "./handle-error";

const isInMergeableState = ({
  draft,
  lastStatus,
  mergeable_state,
}: {
  draft?: boolean;
  lastStatus: "success" | "failure";
  mergeable_state: string;
}) => !draft && mergeable_state === "clean" && lastStatus === "success";

const isRebasable = ({
  draft,
  lastStatus,
  mergeable_state,
}: {
  draft?: boolean;
  lastStatus: "success" | "failure";
  mergeable_state: string;
}) => !draft && mergeable_state === "behind" && lastStatus === "success";

const extractLastCommitStatusFromPR =
  ({
    github,
    owner,
    repo,
  }: {
    github: InstanceType<typeof GitHub>;
    owner: string;
    repo: string;
  }) =>
  async ({ number }: { number: number }): Promise<"success" | "failure"> => {
    const pullRequestCommits = await github.rest.pulls.listCommits({
      owner,
      pull_number: number,
      repo,
    });

    const lastCommit = pullRequestCommits.data.at(-1);

    if (!lastCommit) {
      return "failure";
    }

    const lastCommitChecks = await github.rest.checks.listForRef({
      owner,
      ref: lastCommit.sha,
      repo,
    });

    const successStatus = lastCommitChecks.data.check_runs.every(
      (check) => check.conclusion === "success"
    );

    return successStatus ? "success" : "failure";
  };

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

    const pullRequestsWithChecks = await Promise.all(
      detailedPullRequestsResponse.map(async (pr) => ({
        ...pr.data,
        lastStatus: await extractLastCommitStatusFromPR({
          github,
          owner,
          repo,
        })(pr.data),
      }))
    );

    const rebasablePullRequests = pullRequestsWithChecks.filter(isRebasable);

    const oldestMergeablePullRequest =
      pullRequestsWithChecks.find(isInMergeableState);
    const oldestRebasablePullRequests = rebasablePullRequests.slice(0, 2);

    debug(`Number of opened PRs: ${pullRequestsWithChecks.length}`);
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

    // If (oldestRebasablePullRequests.length > 0) {
    //   await Promise.all(
    //     oldestRebasablePullRequests.map(async (pullRequest) =>
    //       github.rest.pulls.updateBranch({
    //         owner,
    //         pull_number: pullRequest.number,
    //         repo,
    //       })
    //     )
    //   );
    // }
  } catch (error: unknown) {
    handleError(error, setFailed);
  }
};

void run();
