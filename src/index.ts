import { debug, getInput, setFailed } from "@actions/core";
import { context, getOctokit } from "@actions/github";

import { handleError } from "./handle-error";

const run = async () => {
  try {
    const token = getInput("github_token", { required: true });
    debug(JSON.stringify(context));
    
    //
    const github = getOctokit(token);
    debug(JSON.stringify(github));
  } catch (error: unknown) {
    handleError(error, setFailed);
  }
};

void run();