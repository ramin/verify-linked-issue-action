const core = require('@actions/core')
const github = require('@actions/github');
const context = github.context;
const token = process.env.GITHUB_TOKEN;
const octokit = github.getOctokit(token);
const fs = require('fs');
const _ = require('lodash');

const successMessage = "Referenced issue found in commit message or PR body."
const defaultErrorMessage = "No referenced issue found. Please create an issue and reference it in the commit message or PR body."

async function verifyLinkedIssue() {
  let linkedIssue = await checkBodyForValidIssue(context, github);
  if (!linkedIssue) {
    linkedIssue = await checkEventsListForConnectedEvent(context, github);
  }

  if(linkedIssue){
    core.notice(successMessage);
  }
  else{
      let comment = core.getInput('comment')

      if (comment.enabled) {
        await createMissingIssueComment(context, github);
      }
      core.setFailed(defaultErrorMessage);
  }
}

async function checkBodyForValidIssue(context, github){
  // core.info(`The event payload: ${JSON.stringify(context.payload, null, 2)}`);
  core.info(context.payload.labels)
  let body = context.payload.pull_request.body;
  if (!body){
    return false;
  }
  core.debug(`Checking PR Body: "${body}"`)
  const pattern = _.escapeRegExp(`${context.payload.repository.full_name}/issues/`)
  core.debug(pattern)
  const re = new RegExp(`${pattern}(\\d+)`);
  core.debug("regexp: " + re);
  const matches = body.match(re);
  core.debug(`regex matches: ${matches}`)
  if(matches){
    for(let i=0,len=matches.length;i<len;i++){
      let match = matches[i];
      let issueId = match.replace('#','').trim();
      core.debug(`verifying match is a valid issue issueId: ${issueId}`)
      try{
        let issue = await  octokit.rest.issues.get({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: issueId,
        });
        if(issue){
          core.debug(`Found issue in PR Body ${issueId}`);
          return true;
        }
      }
      catch{
        core.debug(`#${issueId} is not a valid issue.`);
      }
    }
  }
  return false;
}

async function checkEventsListForConnectedEvent(context, github){
  let pull = await octokit.rest.issues.listEvents({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.pull_request.number
  });

  if(pull.data){
    pull.data.forEach(item => {
      if (item.event == "connected"){
        core.debug(`Found connected event.`);
        return true;
      }
    });
  }
  return false;
}

async function createMissingIssueComment(context) {
  let comment = core.getInput('comment');
  let messageBody = comment.body ? comment.message : defaultErrorMessage;

  if(!messageBody){
    let filename = core.getInput('filename');
    if(!filename){
      filename = '.github/VERIFY_PR_COMMENT_TEMPLATE.md';
    }
    messageBody=defaultMessage;
    try{
      const file = fs.readFileSync(filename, 'utf8')
      if(file){
        messageBody = file;
      }
      else{
        messageBody = defaultMessage;
      }
    }
    catch{
      messageBody = defaultMessage;
    }
  }

  core.debug(`Adding comment to PR. Comment text: ${messageBody}`);
  await octokit.rest.issues.createComment({
    issue_number: context.payload.pull_request.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: messageBody
  });
}

async function run() {
  try {
    if(!context.payload.pull_request){
        core.info('Not a pull request skipping verification!');
        return;
    }

    core.debug('Starting Linked Issue Verification!');
    await verifyLinkedIssue();

  } catch (err) {
    core.error(`Error verifying linked issue.`)
    core.error(err)

    if (err.errors) core.error(err.errors)
    const errorMessage = "Error verifying linked issue."
    core.setFailed(errorMessage + '\n\n' + err.message)
  }
}

run();
