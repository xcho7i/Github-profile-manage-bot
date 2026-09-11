import { createOctokit, ensureLabel, createIssue, getCoreRateLimit } from '../github.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

export async function runIssueFlow(): Promise<void> {
  const octokit = await createOctokit();
  try {
    await ensureLabel(octokit, config.issueLabel);
  } catch (_) {
    // label errors are handled internally; continue
  }
  try {
    const { remaining, reset } = await getCoreRateLimit(octokit);
    if (remaining < 10) {
      return logger.warn({ remaining, reset }, 'Skipping issue creation due to low rate limit');
    }
  } catch (e) {
    // If rateLimit.get fails (e.g., secondary rate limits), skip this cycle rather than crashing
    return logger.warn('Skipping issue creation; unable to read rate limits');
  }
  const timestamp = new Date().toISOString();
  const random = Math.random().toString(36).slice(2, 8);
  const title = config.issueTitleTemplate
    .replace('${timestamp}', timestamp)
    .replace('${random}', random);
  const body = config.issueBodyTemplate
    .replace('${timestamp}', timestamp)
    .replace('${random}', random);
  const number = await createIssue(octokit, title, body, [config.issueLabel]);
  logger.info({ issue: number }, 'Ensured virtual certificate issue');
}

