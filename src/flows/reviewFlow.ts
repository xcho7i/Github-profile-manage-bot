import { createOctokit, createUserOctokit, submitReview, getCoreRateLimit } from '../github.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

export async function runReviewFlow(): Promise<void> {
  if (!config.autoReview) return;
  const octokit = config.reviewAsUser ? await createUserOctokit() : await createOctokit();
  try {
    const { remaining, reset } = await getCoreRateLimit(octokit);
    if (remaining < 20) {
      return logger.warn({ remaining, reset }, 'Skipping reviews due to low rate limit');
    }
  } catch (_) {
    // continue best-effort
  }

  const prs = await octokit.pulls.list({ owner: config.owner, repo: config.repo, state: 'open', per_page: 50 });
  let reviewed = 0;
  // Avoid calling /user when using GitHub App auth (403 for installations)
  let me = '';
  const isAppAuth = !!(process.env.GH_APP_ID && process.env.GH_INSTALLATION_ID);
  if (!isAppAuth) {
    try {
      me = (await octokit.users.getAuthenticated()).data.login;
    } catch (_) {
      // if we can't determine self login, skip to avoid async in predicate
    }
  }
  for (const pr of prs.data) {
    if (reviewed >= config.reviewMaxPerRun) break;
    // Skip PRs already reviewed by the bot
    try {
      const reviews = await octokit.pulls.listReviews({ owner: config.owner, repo: config.repo, pull_number: pr.number, per_page: 100 });
      const hasMine = reviews.data.some((r) => (r.user?.login ?? '').length > 0 && r.user?.login === me);
      if (hasMine) continue;
    } catch (_) {
      // if review listing fails, skip this PR
      continue;
    }

    await submitReview(octokit, pr.number, config.reviewEvent, config.reviewBody);
    reviewed += 1;
  }
  logger.info({ reviewed }, 'Review flow complete');
}

