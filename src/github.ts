import { Octokit } from '@octokit/rest';
import { App } from '@octokit/app';
import { config, appendCoAuthor } from './config.js';
import { logger } from './logger.js';

const createdLabels = new Set<string>();

export async function createOctokit(): Promise<Octokit> {
  // Prefer GitHub App installation tokens when configured
  if (config.appId && config.installationId && config.appPrivateKey) {
    let normalizedKey = (config.appPrivateKey || '').trim();
    // If provided with escaped newlines, unescape them
    if (normalizedKey.includes('\\n')) {
      normalizedKey = normalizedKey.replace(/\\n/g, '\n');
    }
    // If not a PEM block, attempt base64 decode
    if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(normalizedKey)) {
      try {
        const decoded = Buffer.from(normalizedKey, 'base64').toString('utf8');
        if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(decoded)) {
          normalizedKey = decoded;
        }
      } catch (_) {
        // ignore; will fail later with clear error
      }
    }
    const app = new App({ appId: Number(config.appId), privateKey: normalizedKey });
    // Request an installation access token, then use @octokit/rest with that token
    const { data } = await (app as any).octokit.request('POST /app/installations/{installation_id}/access_tokens', {
      installation_id: Number(config.installationId),
    });
    return new Octokit({ auth: data.token });
  }
  return new Octokit({ auth: config.githubToken });
}

export async function createUserOctokit(): Promise<Octokit> {
  // Force personal token auth regardless of app settings
  return new Octokit({ auth: config.githubToken });
}

export async function createUserOctokit2(): Promise<Octokit> {
  // Second user token for collaboration (e.g., Galaxy Brain badge automation)
  if (!config.githubToken2) {
    throw new Error('GITHUB_TOKEN_2 is required for collaboration features');
  }
  return new Octokit({ auth: config.githubToken2 });
}

export async function getUser2Login(octokit: Octokit): Promise<string> {
  const { data } = await octokit.users.getAuthenticated();
  return data.login;
}

export async function createRepository(octokit: Octokit, repoName: string, description?: string): Promise<{ owner: string; repo: string }> {
  const { data } = await octokit.repos.createForAuthenticatedUser({
    name: repoName,
    description: description || 'Temporary repository for Galaxy Brain badge',
    private: false, // Must be public for badge to count
    auto_init: true, // Initialize with README
    has_discussions: true, // Enable discussions
    has_issues: false,
    has_projects: false,
    has_wiki: false,
  });
  return { owner: data.owner.login, repo: data.name };
}

export async function deleteRepository(octokit: Octokit, owner: string, repo: string): Promise<void> {
  await octokit.repos.delete({ owner, repo });
  logger.info({ owner, repo }, 'Repository deleted');
}

export async function starRepository(octokit: Octokit, owner: string, repo: string): Promise<void> {
  try {
    await octokit.activity.starRepoForAuthenticatedUser({ owner, repo });
    logger.info({ owner, repo }, 'Starred repository');
  } catch (err: any) {
    // If already starred (304) or other error, log but don't fail
    if (err?.status === 304) {
      logger.debug({ owner, repo }, 'Repository already starred');
    } else {
      logger.warn({ owner, repo, err: err?.message }, 'Could not star repository');
    }
  }
}

/**
 * Adds GitHub topics to a repository
 * @param octokit - Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param topics - Array of topic names to add
 */
export async function addRepositoryTopics(
  octokit: Octokit,
  owner: string,
  repo: string,
  topics: string[]
): Promise<void> {
  try {
    // Get current topics first
    let currentTopics: string[] = [];
    try {
      const { data } = await octokit.repos.getAllTopics({
        owner,
        repo,
      });
      currentTopics = data.names || [];
    } catch (e: any) {
      if (e.status !== 404) {
        logger.warn({ owner, repo, err: e?.message }, 'Could not fetch current topics');
      }
    }

    // Merge current topics with new topics (avoid duplicates)
    const allTopics = [...new Set([...currentTopics, ...topics])];
    
    // Check if all topics are already set
    const newTopics = topics.filter(topic => !currentTopics.includes(topic));
    
    if (newTopics.length === 0) {
      logger.debug({ owner, repo, topics: currentTopics }, 'All topics already set');
      return;
    }

    logger.info({ owner, repo, newTopics, totalTopics: allTopics.length }, 'Adding GitHub topics');

    // Replace all topics (GitHub API requires replacing, not adding)
    await octokit.repos.replaceAllTopics({
      owner,
      repo,
      names: allTopics,
    });

    logger.info({ owner, repo, topics: allTopics }, 'Successfully added GitHub topics');
  } catch (e: any) {
    if (e.status === 401) {
      logger.warn({ owner, repo }, 'Authentication failed. Token may not have permission to modify topics.');
    } else if (e.status === 403) {
      logger.warn({ owner, repo }, 'Access forbidden. Token may not have "public_repo" or "repo" scope.');
    } else if (e.status === 404) {
      logger.warn({ owner, repo }, 'Repository not found or no access');
    } else {
      logger.warn({ owner, repo, err: e?.message }, 'Failed to add GitHub topics');
    }
  }
}

export async function getDefaultBranchSha(octokit: Octokit): Promise<string> {
  return retryWithBackoff(async () => {
    const { data } = await octokit.repos.get({ owner: config.owner, repo: config.repo });
    const defaultBranch = config.defaultBranch || data.default_branch;
    const branch = await octokit.repos.getBranch({ owner: config.owner, repo: config.repo, branch: defaultBranch });
    return branch.data.commit.sha;
  });
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      // Don't retry on 404 or authentication errors
      if (err?.status === 404 || err?.status === 401 || err?.status === 403) {
        throw err;
      }
      // Retry on network errors, timeouts, and 500 errors
      const isNetworkError = err?.message?.includes('timeout') || 
                            err?.message?.includes('ECONNRESET') ||
                            err?.message?.includes('fetch failed') ||
                            err?.status === 500 ||
                            err?.status === 502 ||
                            err?.status === 503;
      
      if (isNetworkError && attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        logger.warn({ attempt: attempt + 1, maxRetries, delay, err: err?.message }, 'Retrying after network error');
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

export async function ensureBranch(octokit: Octokit, branchName: string): Promise<void> {
  return retryWithBackoff(async () => {
    try {
      await octokit.git.getRef({ owner: config.owner, repo: config.repo, ref: `heads/${branchName}` });
      // Branch exists, nothing to do
      return;
    } catch (err: any) {
      // Only create branch if it doesn't exist (404), otherwise rethrow
      if (err?.status !== 404) {
        throw err;
      }
      // Branch doesn't exist, create it from default branch
      const baseSha = await getDefaultBranchSha(octokit);
      try {
        await octokit.git.createRef({
          owner: config.owner,
          repo: config.repo,
          ref: `refs/heads/${branchName}`,
          sha: baseSha,
        });
      } catch (createErr: any) {
        // If branch was created between check and create (race condition), that's fine
        // Check multiple possible error message formats
        const errorMessage = createErr?.message || createErr?.response?.data?.message || '';
        if (createErr?.status === 422 && (
          errorMessage.includes('already exists') || 
          errorMessage.includes('Reference already exists') ||
          errorMessage.includes('already exists')
        )) {
          logger.info({ branchName }, 'Branch was created by another process (race condition), treating as success');
          return;
        }
        throw createErr;
      }
    }
  });
}

export async function ensureBranchFrom(octokit: Octokit, newBranch: string, baseBranch: string): Promise<void> {
  try {
    await octokit.git.getRef({ owner: config.owner, repo: config.repo, ref: `heads/${newBranch}` });
    return; // Branch already exists
  } catch (err: any) {
    // Only proceed to create if branch doesn't exist (404), otherwise rethrow
    if (err?.status !== 404) {
      throw err;
    }
  }
  // Branch doesn't exist, create it from base branch
  try {
    const base = await octokit.repos.getBranch({ owner: config.owner, repo: config.repo, branch: baseBranch });
    await octokit.git.createRef({
      owner: config.owner,
      repo: config.repo,
      ref: `refs/heads/${newBranch}`,
      sha: base.data.commit.sha,
    });
  } catch (err: any) {
    // If base branch doesn't exist, log and rethrow
    if (err?.status === 404) {
      logger.error({ baseBranch, newBranch }, 'Base branch not found when creating branch');
      throw err;
    }
    // If branch was created between check and create (race condition), that's fine
    const errorMessage = err?.message || err?.response?.data?.message || '';
    if (err?.status === 422 && (
      errorMessage.includes('already exists') || 
      errorMessage.includes('Reference already exists')
    )) {
      logger.info({ newBranch }, 'Branch was created by another process (race condition), treating as success');
      return;
    }
    throw err;
  }
}

export async function commitFiles(
  octokit: Octokit,
  branchName: string,
  files: Array<{ path: string; content: string }>,
  commitMessage: string,
): Promise<string> {
  return retryWithBackoff(async () => {
    async function createCommitOnHead(headSha: string): Promise<{ commitSha: string }> {
    const baseTreeSha = await getCommitTreeSha(octokit, headSha);
    const blobs = await Promise.all(
      files.map(async (file) => {
        const blob = await octokit.git.createBlob({
          owner: config.owner,
          repo: config.repo,
          content: file.content,
          encoding: 'utf-8',
        });
        return { path: file.path, sha: blob.data.sha };
      }),
    );

    const { data: tree } = await octokit.git.createTree({
      owner: config.owner,
      repo: config.repo,
      base_tree: baseTreeSha,
      tree: blobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
    });

    const messageWithCoAuthor = appendCoAuthor(commitMessage);
    const { data: commit } = await octokit.git.createCommit({
      owner: config.owner,
      repo: config.repo,
      message: messageWithCoAuthor,
      tree: tree.sha,
      parents: [headSha],
    });
    return { commitSha: commit.sha };
  }

  // Check if branch exists first, if not, ensure it's created
  let branchExists = false;
  try {
    await octokit.git.getRef({ owner: config.owner, repo: config.repo, ref: `heads/${branchName}` });
    branchExists = true;
  } catch (err: any) {
    if (err?.status !== 404) {
      throw err;
    }
    // Branch doesn't exist, will create it below
  }

  const latestCommitSha = await getBranchHeadSha(octokit, branchName);
  const { commitSha } = await createCommitOnHead(latestCommitSha);

  try {
    if (branchExists) {
      await octokit.git.updateRef({
        owner: config.owner,
        repo: config.repo,
        ref: `heads/${branchName}`,
        sha: commitSha,
        force: false,
      });
    } else {
      // Branch doesn't exist, create it
      await octokit.git.createRef({
        owner: config.owner,
        repo: config.repo,
        ref: `refs/heads/${branchName}`,
        sha: commitSha,
      });
    }
  } catch (e: any) {
    // If ref doesn't exist (404), create it
    if (e?.status === 404) {
      await octokit.git.createRef({
        owner: config.owner,
        repo: config.repo,
        ref: `refs/heads/${branchName}`,
        sha: commitSha,
      });
      return commitSha;
    }
    const message = e?.message ?? '';
    const notFastForward = typeof message === 'string' && message.toLowerCase().includes('not a fast forward');
    if (!notFastForward) throw e;
    // Rebase on latest and retry once
    const refreshedHead = await getBranchHeadSha(octokit, branchName);
    const { commitSha: rebasedCommit } = await createCommitOnHead(refreshedHead);
    await octokit.git.updateRef({
      owner: config.owner,
      repo: config.repo,
      ref: `heads/${branchName}`,
      sha: rebasedCommit,
      force: true,
    });
    return rebasedCommit;
  }

    return commitSha;
  });
}

async function getBranchHeadSha(octokit: Octokit, branchName: string): Promise<string> {
  try {
    const { data } = await octokit.git.getRef({ owner: config.owner, repo: config.repo, ref: `heads/${branchName}` });
    return data.object.sha;
  } catch (err: any) {
    // If branch doesn't exist (404), fall back to default branch
    // Suppress warning for bot branches that may have been deleted after merge
    if (err?.status === 404) {
      if (!branchName.startsWith(config.workingBranchPrefix)) {
        logger.warn({ branchName }, 'Branch not found, using default branch SHA');
      }
      return await getDefaultBranchSha(octokit);
    }
    throw err;
  }
}

async function getCommitTreeSha(octokit: Octokit, commitSha: string): Promise<string> {
  const { data } = await octokit.git.getCommit({ owner: config.owner, repo: config.repo, commit_sha: commitSha });
  return data.tree.sha;
}

export async function findOpenPrByHead(octokit: Octokit, headBranch: string) {
  const { data } = await octokit.pulls.list({
    owner: config.owner,
    repo: config.repo,
    state: 'open',
    head: `${config.owner}:${headBranch}`,
    per_page: 100,
  });
  return data[0] ?? null;
}

export async function ensureLabel(octokit: Octokit, name: string, color = '0e8a16'): Promise<void> {
  if (createdLabels.has(name)) return;
  try {
    await octokit.issues.getLabel({ owner: config.owner, repo: config.repo, name });
    createdLabels.add(name);
    return;
  } catch (e: any) {
    if (e?.status && e.status !== 404) {
      logger.warn({ name, err: e?.message }, 'Skipping label fetch due to error');
      return; // rate limit or other transient; do not crash
    }
  }
  try {
    await octokit.issues.createLabel({ owner: config.owner, repo: config.repo, name, color });
    createdLabels.add(name);
  } catch (e: any) {
    logger.warn({ name, err: e?.message }, 'Skipping label create due to error');
  }
}

export async function addLabelsToIssue(octokit: Octokit, issue_number: number, labels: string[]): Promise<void> {
  if (!labels || labels.length === 0) return;
  try {
    await octokit.issues.addLabels({ owner: config.owner, repo: config.repo, issue_number, labels });
  } catch (e: any) {
    logger.warn({ issue_number, labels, err: e?.message }, 'Failed to add labels');
  }
}

export async function createIssueComment(octokit: Octokit, issue_number: number, body: string): Promise<void> {
  if (!body) return;
  try {
    await octokit.issues.createComment({ owner: config.owner, repo: config.repo, issue_number, body });
  } catch (e: any) {
    logger.warn({ issue_number, err: e?.message }, 'Failed to create comment');
  }
}

export async function createIssue(
  octokit: Octokit,
  title: string,
  body: string,
  labels: string[],
): Promise<number> {
  const created = await octokit.issues.create({ owner: config.owner, repo: config.repo, title, body, labels });
  return created.data.number;
}

export async function getCoreRateLimit(octokit: Octokit): Promise<{ remaining: number; reset: number }> {
  const { data } = await (octokit as any).rateLimit.get();
  const { remaining, reset } = data.resources.core;
  return { remaining, reset };
}

export async function createOrUpdatePr(
  octokit: Octokit,
  headBranch: string,
  title: string,
  body: string,
): Promise<number> {
  const existing = await findOpenPrByHead(octokit, headBranch);
  if (existing) {
    await octokit.pulls.update({
      owner: config.owner,
      repo: config.repo,
      pull_number: existing.number,
      title,
      body: appendCredit(body),
    });
    logger.info({ pr: existing.number }, 'Updated existing PR');
    return existing.number;
  }

  const { data: pr } = await octokit.pulls.create({
    owner: config.owner,
    repo: config.repo,
    head: headBranch,
    base: config.defaultBranch,
    title,
    body: appendCredit(body),
    maintainer_can_modify: true,
    draft: false,
  });
  logger.info({ pr: pr.number }, 'Created new PR');
  return pr.number;
}

export async function deleteBranch(octokit: Octokit, branchName: string): Promise<void> {
  try {
    await octokit.git.deleteRef({
      owner: config.owner,
      repo: config.repo,
      ref: `heads/${branchName}`,
    });
    logger.info({ branchName }, 'Deleted branch');
  } catch (e: any) {
    // If branch doesn't exist (404) or was already deleted, that's fine
    if (e?.status === 404) {
      logger.debug({ branchName }, 'Branch already deleted or not found');
      return;
    }
    // Log other errors but don't throw - branch deletion is best-effort
    logger.warn({ branchName, err: e?.message }, 'Failed to delete branch');
  }
}

export async function tryMergePr(
  octokit: Octokit,
  pull_number: number,
  method: 'merge' | 'squash' | 'rebase',
): Promise<boolean> {
  try {
    const { data } = await octokit.pulls.get({ owner: config.owner, repo: config.repo, pull_number });
    if (data.mergeable === false) {
      return false;
    }
    const headBranch = data.head.ref;
    await octokit.pulls.merge({
      owner: config.owner,
      repo: config.repo,
      pull_number,
      merge_method: method,
    });
    logger.info({ pull_number }, 'Merged PR');

    // Award "YOLO badge" (best-effort) after successful auto-merge
    if (config.yoloBadgeEnabled) {
      try {
        await ensureLabel(octokit, config.yoloBadgeLabel, config.yoloBadgeLabelColor);
      } catch (_) {
        // ensureLabel already logs; continue
      }
      await addLabelsToIssue(octokit, pull_number, [config.yoloBadgeLabel]);
      const badge = `![YOLO](${config.yoloBadgeShieldUrl})`;
      const commentBody = `${badge}\n\n${config.yoloBadgeCommentText}`;
      await createIssueComment(octokit, pull_number, commentBody);
    }
    
    // Delete the branch after successful merge (but preserve 'master' branch for master flow)
    if (headBranch !== 'master') {
      await deleteBranch(octokit, headBranch);
    }
    
    return true;
  } catch (e: any) {
    logger.warn({ pull_number, err: e?.message }, 'Merge attempt failed');
    return false;
  }
}

export async function submitReview(
  octokit: Octokit,
  pull_number: number,
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
  body: string,
): Promise<void> {
  // Normalize event to valid union and avoid invalid casing/values
  const upper = String(event || '').toUpperCase();
  let normalizedEvent: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' =
    upper === 'APPROVE' || upper === 'REQUEST_CHANGES' || upper === 'COMMENT' ? (upper as any) : 'COMMENT';

  try {
    // Avoid attempting to approve/request-changes on our own PRs (disallowed by GitHub)
    let selfLogin = '';
    const isAppAuth = !!(process.env.GH_APP_ID && process.env.GH_INSTALLATION_ID);
    if (!isAppAuth) {
      try {
        selfLogin = (await octokit.users.getAuthenticated()).data.login;
      } catch (_) {
        // ignore, best-effort
      }
    }
    let authorLogin = '';
    try {
      const pr = await octokit.pulls.get({ owner: config.owner, repo: config.repo, pull_number });
      authorLogin = pr.data.user?.login ?? '';
    } catch (_) {
      // ignore, best-effort
    }
    if (selfLogin && authorLogin && selfLogin === authorLogin && normalizedEvent !== 'COMMENT') {
      normalizedEvent = 'COMMENT';
    }

    await octokit.pulls.createReview({
      owner: config.owner,
      repo: config.repo,
      pull_number,
      event: normalizedEvent,
      body,
    });
    logger.info({ pull_number, event: normalizedEvent }, 'Submitted review');
  } catch (e: any) {
    // If GitHub rejects the event value, retry once with COMMENT
    const message = e?.message ?? '';
    const isEventInvalid = typeof message === 'string' && message.includes('PullRequestReviewEvent');
    if (isEventInvalid && normalizedEvent !== 'COMMENT') {
      try {
        await octokit.pulls.createReview({
          owner: config.owner,
          repo: config.repo,
          pull_number,
          event: 'COMMENT',
          body,
        });
        logger.info({ pull_number, event: 'COMMENT' }, 'Submitted review (fallback)');
        return;
      } catch (e2: any) {
        logger.warn({ pull_number, err: e2?.message }, 'Submit review fallback failed');
      }
    }
    logger.warn({ pull_number, err: e?.message }, 'Submit review failed');
  }
}

function appendCredit(body: string): string {
  const footer = `\n\n— ${config.creditFooter}`;
  return body?.includes(config.creditFooter) ? body : (body || '') + footer;
}

export async function getTextFileAtRef(
  octokit: Octokit,
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    const res = await (octokit as any).repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path,
      ref,
    });
    const data = res.data;
    if (Array.isArray(data)) return null;
    if (data.type !== 'file' || !data.content) return null;
    const buff = Buffer.from(data.content, 'base64');
    return buff.toString('utf8');
  } catch (e: any) {
    if (e.status === 404) return null;
    throw e;
  }
}

