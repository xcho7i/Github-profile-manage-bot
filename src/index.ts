import { config, validateConfig, processCommitMessageTemplate } from './config.js';
import { logger } from './logger.js';
import { createOctokit, ensureBranch, commitFiles, createOrUpdatePr, tryMergePr, submitReview, starRepository, addRepositoryTopics } from './github.js';
import { StrategyContext } from './types.js';
import { touchReadmeStrategy } from './strategies/touchReadmeStrategy.js';
import { runMasterEditFlow } from './flows/masterEditFlow.js';
import { runIssueFlow } from './flows/issueFlow.js';
import { runReviewFlow } from './flows/reviewFlow.js';
import { runBadgeManagementFlow } from './flows/badgeManagementFlow.js';
import { diagnoseGalaxyBrainBadge } from './flows/badgeDiagnostics.js';
import { addTopicHourly, initializeTopicManagement } from './flows/topicManagementFlow.js';

async function runOnce(): Promise<void> {
  validateConfig();
  const octokit = await createOctokit();

  const context: StrategyContext = {
    owner: config.owner,
    repo: config.repo,
    defaultBranch: config.defaultBranch,
    workingBranchPrefix: config.workingBranchPrefix,
  };

  const strategy = touchReadmeStrategy; // Swap in any strategy you implement
  const branchName = strategy.generateBranchName(context);

  const result = await strategy.run(context);
  if (!result.hasChanges || !result.files || result.files.length === 0) {
    logger.info('No changes to commit.');
    return;
  }

  await ensureBranch(octokit, branchName);
  const commitMessage = result.title 
    ? processCommitMessageTemplate(result.title)
    : processCommitMessageTemplate(config.commitMessageTemplate);
  await commitFiles(
    octokit,
    branchName,
    result.files,
    commitMessage,
  );

  const prNumber = await createOrUpdatePr(
    octokit,
    branchName,
    result.title ?? 'chore: automated update',
    result.body ?? '',
  );

  logger.info({ prNumber }, 'Run complete');

  if (config.autoReview) {
    await submitReview(octokit, prNumber, config.reviewEvent, config.reviewBody);
  }

  if (config.autoMerge) {
    const merged = await tryMergePr(octokit, prNumber, config.mergeMethod);
    logger.info({ prNumber, merged }, 'Auto-merge attempted');
  }
}

async function main(): Promise<void> {
  // Automatically star the repository at startup
  try {
    const octokit = await createOctokit();
    await starRepository(octokit, config.owner, config.repo);
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Could not star repository at startup');
  }

  // Initialize topic management (adds first topic if needed, then switches to hourly)
  try {
    await initializeTopicManagement();
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Could not initialize topic management');
  }

  // Start hourly topic addition flow
  const topicIntervalSeconds = 3600; // 1 hour
  logger.info({ intervalSeconds: topicIntervalSeconds }, 'Starting hourly topic addition flow');
  
  // Run immediately, then schedule hourly
  addTopicHourly().catch((err) => {
    logger.warn({ err: err?.message }, 'Initial hourly topic addition failed');
  });
  
  setInterval(() => {
    addTopicHourly().catch((err) => {
      logger.warn({ err: err?.message }, 'Scheduled hourly topic addition failed');
    });
  }, topicIntervalSeconds * 1000);
  
  // Run diagnostics if requested
  if (process.env.RUN_DIAGNOSTICS === 'true') {
    await diagnoseGalaxyBrainBadge();
    if (process.env.DIAGNOSTICS_ONLY === 'true') {
      return; // Exit after diagnostics
    }
  }
  
  // Start badge management flow if enabled (runs independently)
  if (config.badgeManagementEnabled) {
    try {
      // Run diagnostics first to check setup
      await diagnoseGalaxyBrainBadge();
      await runBadgeManagementFlow();
    } catch (err: any) {
      logger.error({ err: err?.message, stack: err?.stack }, 'Badge management flow failed on startup, will retry on schedule');
    }
    if (config.badgeManagementIntervalSeconds > 0) {
      logger.info({ everySeconds: config.badgeManagementIntervalSeconds }, 'Starting schedule (badge management)');
      setInterval(() => {
        runBadgeManagementFlow().catch((err) => logger.error({ err: err?.message }, 'Scheduled badge management failed'));
      }, config.badgeManagementIntervalSeconds * 1000);
    }
  }

  // Start review flow if enabled (regardless of other modes)
  if (config.reviewFlowEnabled) {
    await runReviewFlow();
    if (config.reviewIntervalSeconds > 0) {
      logger.info({ everySeconds: config.reviewIntervalSeconds }, 'Starting schedule (review flow)');
      setInterval(() => {
        runReviewFlow().catch((err) => logger.error({ err }, 'Scheduled review flow failed'));
      }, config.reviewIntervalSeconds * 1000);
    }
  }

  // Review-only mode skips PR creation flows
  if (config.reviewOnly) {
    return;
  }
  if (process.env.MASTER_FLOW === 'true') {
    await runMasterEditFlow();
    if (config.masterIntervalSeconds > 0) {
      logger.info({ everySeconds: config.masterIntervalSeconds }, 'Starting schedule (master flow)');
      setInterval(() => {
        runMasterEditFlow().catch((err) => logger.error({ err }, 'Scheduled master flow failed'));
      }, config.masterIntervalSeconds * 1000);
    }
    // do not return; allow issue flow to also run if enabled
  }

  if (config.issueEnabled) {
    await runIssueFlow();
    if (config.issueIntervalSeconds > 0) {
      logger.info({ everySeconds: config.issueIntervalSeconds }, 'Starting schedule (issue flow)');
      setInterval(() => {
        runIssueFlow().catch((err) => logger.error({ err }, 'Scheduled issue flow failed'));
      }, config.issueIntervalSeconds * 1000);
    }
    // When issue flow is enabled, do not continue to default strategy
    // Also start review flow if enabled
    if (config.reviewFlowEnabled) {
      await runReviewFlow();
      if (config.reviewIntervalSeconds > 0) {
        logger.info({ everySeconds: config.reviewIntervalSeconds }, 'Starting schedule (review flow)');
        setInterval(() => {
          runReviewFlow().catch((err) => logger.error({ err }, 'Scheduled review flow failed'));
        }, config.reviewIntervalSeconds * 1000);
      }
    }
    return;
  }
  await runOnce();
  if (config.scheduleSeconds > 0) {
    logger.info({ everySeconds: config.scheduleSeconds }, 'Starting schedule');
    setInterval(() => {
      runOnce().catch((err) => logger.error({ err }, 'Scheduled run failed'));
    }, config.scheduleSeconds * 1000);
  }
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});

