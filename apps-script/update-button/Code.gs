const DEPLOYMENT_CONFIG = Object.freeze({
  owner: 'NiklasBorson',
  repository: 'WIDT',
  workflow: 'deploy-pages.yml',
  ref: 'main',
  triggerSource: 'widt-update-button',
});
const REQUEST_COOLDOWN_MILLISECONDS = 5 * 60 * 1000;
const LAST_REQUEST_PROPERTY = 'LAST_SUCCESSFUL_REQUEST_MS';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Update WIDT Rehearsal Finder');
}

function requestDeployment() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return {
      status: 'busy',
      message: 'Another update request is currently being processed.',
    };
  }

  try {
    const scriptProperties = PropertiesService.getScriptProperties();
    const lastRequest = Number(scriptProperties.getProperty(LAST_REQUEST_PROPERTY)) || 0;
    const now = Date.now();
    const remainingMilliseconds =
      REQUEST_COOLDOWN_MILLISECONDS - (now - lastRequest);

    if (remainingMilliseconds > 0) {
      return {
        status: 'cooldown',
        message: 'An update was requested recently.',
        retryAfterSeconds: Math.ceil(remainingMilliseconds / 1000),
      };
    }

    const result = dispatchDeployment_();
    const requestedAt = Date.now();
    scriptProperties.setProperty(LAST_REQUEST_PROPERTY, String(requestedAt));

    return Object.assign(result, {
      status: 'accepted',
      requestedAt: new Date(requestedAt).toISOString(),
    });
  } finally {
    lock.releaseLock();
  }
}

function dispatchDeployment_() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    throw new Error('The GitHub token is not configured.');
  }

  const url =
    `https://api.github.com/repos/${DEPLOYMENT_CONFIG.owner}/` +
    `${DEPLOYMENT_CONFIG.repository}/actions/workflows/` +
    `${DEPLOYMENT_CONFIG.workflow}/dispatches`;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2026-03-10',
    },
    payload: JSON.stringify({
      ref: DEPLOYMENT_CONFIG.ref,
      inputs: {
        triggerSource: DEPLOYMENT_CONFIG.triggerSource,
      },
    }),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const responseBody = response.getContentText();
  if (status !== 200 && status !== 204) {
    throw new Error(
      `GitHub rejected the deployment request with HTTP ${status}: ` +
        getGitHubErrorMessage_(responseBody),
    );
  }

  if (status === 204) {
    return {
      accepted: true,
      message: 'GitHub accepted the deployment request.',
    };
  }

  let result;
  try {
    result = JSON.parse(responseBody);
  } catch (error) {
    throw new Error('GitHub accepted the request but returned an invalid response.');
  }

  return {
    accepted: true,
    message: 'GitHub accepted the deployment request.',
    runId: result.workflow_run_id,
    runUrl: result.html_url,
  };
}

function getGitHubErrorMessage_(responseBody) {
  try {
    const error = JSON.parse(responseBody);
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message.trim();
    }
  } catch (parseError) {
    // Fall through to the bounded plain-text response.
  }

  const message = responseBody.trim();
  return message ? message.slice(0, 500) : 'No error details were returned.';
}
