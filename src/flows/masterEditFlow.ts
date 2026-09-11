import { createOctokit, ensureBranchFrom, commitFiles, createOrUpdatePr, getTextFileAtRef, tryMergePr, submitReview } from '../github.js';
import { ensureCreditsOnBranch } from './credits.js';
import { config, processCommitMessageTemplate } from '../config.js';
import { logger } from '../logger.js';

export async function runMasterEditFlow(): Promise<void> {
  const octokit = await createOctokit();
  // Respect rate limit before doing any writes
  try {
    const { remaining, reset } = await (await import('../github.js')).getCoreRateLimit(octokit);
    if (remaining < 20) {
      return logger.warn({ remaining, reset }, 'Skipping master flow due to low rate limit');
    }
  } catch (_) {
    // continue best-effort
  }
  const defaultBranch = config.defaultBranch;
  const masterBranch = 'master';

  // 1) ensure master exists from default branch
  await ensureBranchFrom(octokit, masterBranch, defaultBranch);

  // 2) read test.txt in master, append a space
  const current = (await getTextFileAtRef(octokit, 'test.txt', masterBranch)) ?? '';
  const updated = current.endsWith(' ') ? current : current + ' ';

  // 3) commit change to master
  const commitMessage = processCommitMessageTemplate(config.masterCommitMessageTemplate);
  await commitFiles(octokit, masterBranch, [{ path: 'test.txt', content: updated }], commitMessage);

  // 3.1) ensure credits file exists/updated on master
  await ensureCreditsOnBranch(masterBranch);

  // 4) open PR from master -> default branch
  const prNumber = await createOrUpdatePr(
    octokit,
    masterBranch,
    'test: update test.txt',
    'Automated edit to test.txt from master into default branch.',
  );

  logger.info({ prNumber }, 'Created/updated PR from master to default branch');

  if (config.autoReview) {
    await submitReview(octokit, prNumber, config.reviewEvent, config.reviewBody);
  }

  if (config.autoMerge) {
    const merged = await tryMergePr(octokit, prNumber, config.mergeMethod);
    logger.info({ prNumber, merged }, 'Auto-merge attempted');
  }
}

