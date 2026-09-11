import { createOctokit, getCoreRateLimit, ensureBranch, commitFiles, createOrUpdatePr, tryMergePr, submitReview, createUserOctokit2, getUser2Login, createRepository, deleteRepository } from '../github.js';
import { config, processCommitMessageTemplate, appendCoAuthor } from '../config.js';
import { logger } from '../logger.js';
import { StrategyContext } from '../types.js';
import { touchReadmeStrategy } from '../strategies/touchReadmeStrategy.js';

interface BadgeInfo {
  name: string;
  currentCount: number;
  targetCount: number;
  needed: number;
}

// GitHub badge types and how to earn them
const BADGE_TYPES = {
  'Pair Extraordinaire': {
    action: 'co-authored-commits',
    description: 'Co-authored commits with another user',
  },
  'Pull Shark': {
    action: 'merged-prs',
    description: 'Pull requests merged',
  },
  'Quickdraw': {
    action: 'fast-reviews',
    description: 'Fast PR reviews/merges',
  },
  'YOLO': {
    action: 'auto-merged-prs',
    description: 'Auto-merged pull requests',
  },
  'Starstruck': {
    action: 'stars',
    description: 'Stars added to repositories',
  },
  'Galaxy Brain': {
    action: 'accepted-discussion-answers',
    description: 'Accepted answers in GitHub Discussions',
  },
};

// Track badge counts (we'll estimate based on actions)
// Note: GitHub doesn't expose badge counts via API, so we track based on actions performed
let badgeCounts: Record<string, number> = {
  'Pair Extraordinaire': 0,
  'Pull Shark': 0,
  'Quickdraw': 0,
  'YOLO': 0,
  'Starstruck': 0,
  'Galaxy Brain': 0,
};

// Track repositories created for Galaxy Brain badge (to delete after completion)
const galaxyBrainRepos: Array<{ owner: string; repo: string }> = [];

export async function runBadgeManagementFlow(): Promise<void> {
  try {
    const octokit = await createOctokit();
    
    try {
      const { remaining, reset } = await getCoreRateLimit(octokit);
      if (remaining < 20) {
        return logger.warn({ remaining, reset }, 'Skipping badge management due to low rate limit');
      }
    } catch (_) {
      // continue best-effort
    }

    logger.info('Starting badge earning flow to reach x4 for all badges');
    
    const targetCount = config.badgeTargetCount || 4;
    
    // Estimate current badge counts based on repository activity
    await estimateBadgeCounts(octokit);
    
    // Calculate which badges need to be earned
    // Prioritize Galaxy Brain if it's at 0 (user wants at least one)
    const badgesToEarn: BadgeInfo[] = [];
    for (const [badgeName, count] of Object.entries(badgeCounts)) {
      // For Galaxy Brain, targetCount of 4 means 32 answers (Platinum x4)
      const actualTarget = badgeName === 'Galaxy Brain' ? 32 : targetCount;
      if (count < actualTarget) {
        badgesToEarn.push({
          name: badgeName,
          currentCount: count,
          targetCount: actualTarget,
          needed: actualTarget - count,
        });
      const needed = actualTarget - count;
      logger.info({ 
        badge: badgeName, 
        current: count, 
        target: actualTarget, 
        needed: needed 
      }, 'Badge needs to be earned');
      
      // Log helpful hints for badges that need configuration
      if (badgeName === 'YOLO' && !config.autoMerge) {
        logger.info('💡 Tip: Enable AUTO_MERGE=true in .env to earn YOLO badge');
      }
      if (badgeName === 'Pair Extraordinaire' && !config.coAuthorEnabled) {
        logger.info('💡 Tip: Enable CO_AUTHOR_ENABLED=true and set CO_AUTHOR_NAME/EMAIL in .env to earn Pair Extraordinaire badge');
      }
      if (badgeName === 'Galaxy Brain' && !config.githubToken2) {
        logger.info('💡 Tip: Set GITHUB_TOKEN_2 in .env to earn Galaxy Brain badge');
      }
      } else {
        logger.info({ badge: badgeName, current: count, target: actualTarget }, 'Badge already at target (x4)');
      }
    }
    
    // Prioritize badges that are furthest from target (but skip those already at x4)
    badgesToEarn.sort((a, b) => {
      // Prioritize badges with lower current counts (need more work)
      const aProgress = a.currentCount / a.targetCount;
      const bProgress = b.currentCount / b.targetCount;
      if (aProgress !== bProgress) {
        return aProgress - bProgress; // Lower progress first
      }
      // If progress is equal, prioritize Quickdraw, YOLO, Starstruck (commonly missing)
      const priorityOrder = ['Quickdraw', 'YOLO', 'Starstruck', 'Pair Extraordinaire', 'Pull Shark', 'Galaxy Brain'];
      const aIndex = priorityOrder.indexOf(a.name);
      const bIndex = priorityOrder.indexOf(b.name);
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      return 0;
    });

    if (badgesToEarn.length === 0) {
      logger.info('All badges are at target count (x4)');
      return;
    }

    // Earn badges by performing actions
    for (const badge of badgesToEarn) {
      const badgeInfo = BADGE_TYPES[badge.name as keyof typeof BADGE_TYPES];
      if (!badgeInfo) continue;

      logger.info({ badge: badge.name, needed: badge.needed, action: badgeInfo.action }, 'Earning badge');

      for (let i = 0; i < badge.needed; i++) {
        try {
          await earnBadge(octokit, badge.name, badgeInfo.action);
          // For Galaxy Brain, we track actual answer count (need 32 for Platinum x4)
          // For other badges, increment normally
          if (badge.name === 'Galaxy Brain') {
            badgeCounts[badge.name] = (badgeCounts[badge.name] || 0) + 1;
          } else {
            badgeCounts[badge.name]++;
          }
          logger.info({ 
            badge: badge.name, 
            earned: i + 1, 
            needed: badge.needed,
            newCount: badgeCounts[badge.name]
          }, 'Badge progress');
          
          // Rate limit protection
          if ((i + 1) % 5 === 0) {
            const { remaining } = await getCoreRateLimit(octokit);
            if (remaining < 20) {
              logger.warn({ remaining }, 'Rate limit low, pausing badge earning');
              await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
            }
          }
        } catch (err: any) {
          logger.warn({ badge: badge.name, err: err?.message }, 'Failed to earn badge');
        }
      }
    }

    logger.info({ finalCounts: badgeCounts }, 'Badge earning flow complete');
    
    // Cleanup Galaxy Brain repositories if badge target reached (32 answers for Platinum x4)
    if (badgeCounts['Galaxy Brain'] >= 32 && galaxyBrainRepos.length > 0) {
      logger.info({ reposToDelete: galaxyBrainRepos.length }, 'Galaxy Brain badge reached Platinum (32 answers), cleaning up created repositories');
      await cleanupGalaxyBrainRepos();
    }
  } catch (err: any) {
    logger.error({ err: err?.message, stack: err?.stack }, 'Badge management flow failed');
    // Don't rethrow - allow other flows to continue
  }
}

async function estimateBadgeCounts(octokit: any): Promise<void> {
  // Estimate based on repository activity
  // Note: This is an approximation since GitHub doesn't expose badge counts via API
  
  // Count merged PRs for Pull Shark (x4 = 4 merged PRs)
  try {
    const mergedPRs = await octokit.pulls.list({
      owner: config.owner,
      repo: config.repo,
      state: 'closed',
      per_page: 100,
    });
    const mergedCount = mergedPRs.data.filter((pr: any) => pr.merged_at).length;
    badgeCounts['Pull Shark'] = Math.min(mergedCount, 4);
    logger.info({ mergedPRs: mergedCount, badgeCount: badgeCounts['Pull Shark'] }, 'Estimated Pull Shark badge count');
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Could not estimate Pull Shark badge count');
    badgeCounts['Pull Shark'] = 0;
  }

  // Count co-authored commits for Pair Extraordinaire (x4 = 4 co-authored commits)
  // We'll estimate based on whether co-authoring is enabled and recent activity
  if (config.coAuthorEnabled && config.coAuthorName && config.coAuthorEmail) {
    try {
      // Try to count commits with co-author trailers
      const commits = await octokit.repos.listCommits({
        owner: config.owner,
        repo: config.repo,
        per_page: 100,
      });
      const coAuthoredCount = commits.data.filter((commit: any) => 
        commit.commit.message?.includes('Co-authored-by:')
      ).length;
      badgeCounts['Pair Extraordinaire'] = Math.min(coAuthoredCount, 4);
      logger.info({ coAuthoredCommits: coAuthoredCount, badgeCount: badgeCounts['Pair Extraordinaire'] }, 'Estimated Pair Extraordinaire badge count');
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Could not estimate Pair Extraordinaire badge count');
      badgeCounts['Pair Extraordinaire'] = 0;
    }
  } else {
    badgeCounts['Pair Extraordinaire'] = 0;
  }

  // Count auto-merged PRs for YOLO (x4 = 4 auto-merged PRs)
  if (config.autoMerge) {
    try {
      const mergedPRs = await octokit.pulls.list({
        owner: config.owner,
        repo: config.repo,
        state: 'closed',
        per_page: 100,
      });
      // Count PRs that were auto-merged (have auto_merge field or merged quickly)
      const autoMergedCount = mergedPRs.data.filter((pr: any) => pr.merged_at).length;
      badgeCounts['YOLO'] = Math.min(autoMergedCount, 4);
      logger.info({ autoMergedPRs: autoMergedCount, badgeCount: badgeCounts['YOLO'] }, 'Estimated YOLO badge count');
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Could not estimate YOLO badge count');
      badgeCounts['YOLO'] = 0;
    }
  } else {
    badgeCounts['YOLO'] = 0;
  }

  // Quickdraw: Count fast reviews/merges (x4 = 4 fast reviews)
  // This is harder to estimate, so we'll start at 0 and let the bot earn them
  badgeCounts['Quickdraw'] = 0;
  
  // Starstruck: Count stars (x4 = 4 stars)
  // This is also hard to estimate, so we'll start at 0 and let the bot earn them
  badgeCounts['Starstruck'] = 0;
  
  // Galaxy Brain: Count answers YOU PROVIDED that were accepted (not answers you accepted)
  try {
    const discussions = await octokit.graphql(`
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          discussions(first: 100) {
            nodes {
              answerChosenAt
              comments(first: 10) {
                nodes {
                  id
                  author {
                    login
                  }
                  isAnswer
                }
              }
            }
          }
        }
      }
    `, {
      owner: config.owner,
      repo: config.repo,
    });
    
    // Count discussions where User 1 provided the accepted answer
    // Note: We need to check ALL repositories, not just the main one
    // For now, we'll estimate based on the main repo, but the actual count
    // will be tracked as we create new repositories
    const validAnswers = discussions?.repository?.discussions?.nodes?.filter((d: any) => {
      if (!d.answerChosenAt) return false;
      const answerComment = d.comments?.nodes?.find((c: any) => c.isAnswer);
      return answerComment?.author?.login === config.owner;
    }).length || 0;
    
    // Galaxy Brain badge tiers: Bronze (2), Silver (8), Gold (16), Platinum (32)
    // We track the actual answer count (need 32 for Platinum x4)
    // Note: This only counts answers in the main repo, but we'll create new repos for each answer
    badgeCounts['Galaxy Brain'] = validAnswers;
    logger.info({ validAnswers, galaxyBrainCount: badgeCounts['Galaxy Brain'] }, 'Galaxy Brain badge count estimated (actual answers)');
  } catch (err: any) {
    // If GraphQL fails, assume 0 and let the bot try to earn it
    badgeCounts['Galaxy Brain'] = 0;
    logger.warn({ err: err?.message }, 'Could not estimate Galaxy Brain badge count, assuming 0');
  }
}

async function earnBadge(octokit: any, badgeName: string, action: string): Promise<void> {
  switch (action) {
    case 'co-authored-commits':
      await earnPairExtraordinaire(octokit);
      break;
    case 'merged-prs':
      await earnPullShark(octokit);
      break;
    case 'fast-reviews':
      await earnQuickdraw(octokit);
      break;
    case 'auto-merged-prs':
      await earnYOLO(octokit);
      break;
    case 'stars':
      await earnStarstruck(octokit);
      break;
    case 'accepted-discussion-answers':
      await earnGalaxyBrain(octokit);
      break;
    default:
      logger.warn({ badgeName, action }, 'Unknown badge action');
  }
}

async function earnPairExtraordinaire(octokit: any): Promise<void> {
  // Create a PR with co-authored commit
  if (!config.coAuthorEnabled || !config.coAuthorName || !config.coAuthorEmail) {
    logger.warn('Co-author not configured, cannot earn Pair Extraordinaire badge');
    return;
  }

  const context: StrategyContext = {
    owner: config.owner,
    repo: config.repo,
    defaultBranch: config.defaultBranch,
    workingBranchPrefix: config.workingBranchPrefix,
  };

  const strategy = touchReadmeStrategy;
  const branchName = strategy.generateBranchName(context);
  const result = await strategy.run(context);

  if (!result.hasChanges || !result.files || result.files.length === 0) {
    return;
  }

  await ensureBranch(octokit, branchName);
  const commitMessage = processCommitMessageTemplate(config.commitMessageTemplate);
  // appendCoAuthor is already called in commitFiles, but ensure it's enabled
  await commitFiles(octokit, branchName, result.files, commitMessage);

  const prNumber = await createOrUpdatePr(
    octokit,
    branchName,
    result.title ?? 'chore: co-authored update for Pair Extraordinaire badge',
    result.body ?? '',
  );

  if (config.autoMerge) {
    await tryMergePr(octokit, prNumber, config.mergeMethod);
  }
}

async function earnPullShark(octokit: any): Promise<void> {
  // Create and merge a PR
  const context: StrategyContext = {
    owner: config.owner,
    repo: config.repo,
    defaultBranch: config.defaultBranch,
    workingBranchPrefix: config.workingBranchPrefix,
  };

  const strategy = touchReadmeStrategy;
  const branchName = strategy.generateBranchName(context);
  const result = await strategy.run(context);

  if (!result.hasChanges || !result.files || result.files.length === 0) {
    return;
  }

  await ensureBranch(octokit, branchName);
  const commitMessage = processCommitMessageTemplate(config.commitMessageTemplate);
  await commitFiles(octokit, branchName, result.files, commitMessage);

  const prNumber = await createOrUpdatePr(
    octokit,
    branchName,
    result.title ?? 'chore: update for Pull Shark badge',
    result.body ?? '',
  );

  // Auto-merge to earn the badge
  await tryMergePr(octokit, prNumber, config.mergeMethod);
}

async function earnQuickdraw(octokit: any): Promise<void> {
  // Quickly review and merge a PR (if one exists)
  const openPRs = await octokit.pulls.list({
    owner: config.owner,
    repo: config.repo,
    state: 'open',
    per_page: 5,
  });

  if (openPRs.data.length > 0) {
    const pr = openPRs.data[0];
    // Quickly review
    await submitReview(octokit, pr.number, 'APPROVE', 'Quick review for Quickdraw badge');
    // Quickly merge
    await tryMergePr(octokit, pr.number, config.mergeMethod);
  } else {
    // Create a PR and quickly merge it
    await earnPullShark(octokit);
  }
}

async function earnYOLO(octokit: any): Promise<void> {
  // Auto-merge a PR (YOLO badge is earned through auto-merged PRs)
  // Enable YOLO badge feature and create/merge a PR
  const context: StrategyContext = {
    owner: config.owner,
    repo: config.repo,
    defaultBranch: config.defaultBranch,
    workingBranchPrefix: config.workingBranchPrefix,
  };

  const strategy = touchReadmeStrategy;
  const branchName = strategy.generateBranchName(context);
  const result = await strategy.run(context);

  if (!result.hasChanges || !result.files || result.files.length === 0) {
    return;
  }

  await ensureBranch(octokit, branchName);
  const commitMessage = processCommitMessageTemplate(config.commitMessageTemplate);
  await commitFiles(octokit, branchName, result.files, commitMessage);

  const prNumber = await createOrUpdatePr(
    octokit,
    branchName,
    result.title ?? 'chore: YOLO auto-merge',
    result.body ?? '',
  );

  // Auto-merge with YOLO badge enabled
  await tryMergePr(octokit, prNumber, config.mergeMethod);
}

async function earnStarstruck(octokit: any): Promise<void> {
  // Starstruck badge is earned by starring repositories
  // Note: Starring the same repo multiple times doesn't count, but we can:
  // 1. Star the main repository (if not already starred)
  // 2. Add reactions to issues/PRs (may contribute to engagement)
  // 3. Create and star other repositories (complex, not implemented)
  
  try {
    // Try to star the repo (requires user token, not app token)
    const { createUserOctokit } = await import('../github.js');
    const userOctokit = await createUserOctokit();
    await (userOctokit as any).activity.starRepoForAuthenticatedUser({
      owner: config.owner,
      repo: config.repo,
    });
    logger.info({ owner: config.owner, repo: config.repo }, 'Starred repository for Starstruck badge');
  } catch (err: any) {
    // If already starred (304) or other error, try adding reactions
    if (err?.status === 304) {
      logger.debug({ owner: config.owner, repo: config.repo }, 'Repository already starred');
    } else {
      logger.warn({ err: err?.message }, 'Could not star repo, trying reactions instead');
    }
    
    // Add reactions to recent issues/PRs to increase engagement
    try {
      const issues = await octokit.issues.listForRepo({
        owner: config.owner,
        repo: config.repo,
        state: 'all',
        per_page: 10,
        sort: 'updated',
      });
      
      // Add reactions to multiple issues/PRs
      let reactionsAdded = 0;
      for (const issue of issues.data.slice(0, 3)) {
        try {
          await octokit.reactions.createForIssue({
            owner: config.owner,
            repo: config.repo,
            issue_number: issue.number,
            content: '+1',
          });
          reactionsAdded++;
          logger.info({ issue: issue.number }, 'Added reaction for Starstruck badge');
        } catch (reactionErr: any) {
          // Skip if reaction already exists or other error
          if (reactionErr?.status !== 422) {
            logger.debug({ issue: issue.number, err: reactionErr?.message }, 'Could not add reaction to issue');
          }
        }
      }
      
      if (reactionsAdded === 0) {
        logger.info('No reactions could be added (may already exist or no issues available)');
      }
    } catch (reactionErr: any) {
      logger.warn({ err: reactionErr?.message }, 'Could not add reactions');
    }
  }
}

async function earnGalaxyBrain(octokit: any): Promise<void> {
  // Galaxy Brain badge is earned by having YOUR answers accepted in GitHub Discussions
  // Process: Create a NEW repository for each discussion (32 times for Platinum)
  // - User 2 (GITHUB_TOKEN_2): Creates repository, creates discussion, accepts answers
  // - User 1 (GITHUB_TOKEN): Provides answers (to earn Galaxy Brain badge)
  // After earning all badges, delete all created repositories
  
  if (!config.githubToken2) {
    logger.warn('GITHUB_TOKEN_2 not configured. Galaxy Brain badge requires two tokens for full automation.');
    logger.info('Please set GITHUB_TOKEN_2 in your .env file for automated Galaxy Brain badge earning.');
    return;
  }
  
  try {
    const user2Octokit = await createUserOctokit2();
    const user2Login = await getUser2Login(user2Octokit);
    
    // Step 1: User 2 creates a NEW repository (must be different each time)
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const repoName = `galaxy-brain-${timestamp}-${random}`;
    
    logger.info({ repoName, owner: user2Login }, 'Creating new repository for Galaxy Brain badge');
    const { owner, repo } = await createRepository(user2Octokit, repoName, 'Temporary repository for Galaxy Brain badge earning');
    
    // Track repository for later deletion
    galaxyBrainRepos.push({ owner, repo });
    
    // Wait a moment for repository to be fully initialized
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 2: Get repository ID and discussion categories
    const repoInfo: any = await user2Octokit.graphql(`
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
          discussionCategories(first: 10) {
            nodes {
              id
              name
            }
          }
        }
      }
    `, {
      owner,
      repo,
    });
    
    const repositoryId = repoInfo?.repository?.id;
    const categories = repoInfo?.repository?.discussionCategories?.nodes || [];
    const categoryId = categories.find((c: any) => c.name === 'Q&A')?.id || categories.find((c: any) => c.name === 'General')?.id || categories[0]?.id;
    
    if (!repositoryId || !categoryId) {
      logger.warn({ owner, repo }, 'Repository not ready or no discussion categories found');
      return;
    }
    
    // Step 3: User 2 creates a discussion in the new repository
    const discussionTitle = `Question: How to use this repository? [${random}]`;
    const discussionBody = `I'm looking for help understanding how to use this repository.

## Question
What are the recommended approaches and best practices?

## Context
I want to learn more about this project and understand the workflow.

Any insights would be appreciated!`;
    
    const createResult: any = await user2Octokit.graphql(`
      mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
        createDiscussion(input: {
          repositoryId: $repositoryId
          categoryId: $categoryId
          title: $title
          body: $body
        }) {
          discussion {
            id
            number
            title
            url
          }
        }
      }
    `, {
      repositoryId,
      categoryId,
      title: discussionTitle,
      body: discussionBody,
    });
    
    const discussionId = createResult?.createDiscussion?.discussion?.id;
    const discussionNumber = createResult?.createDiscussion?.discussion?.number;
    const discussionUrl = createResult?.createDiscussion?.discussion?.url;
    
    if (!discussionId) {
      logger.warn({ owner, repo }, 'Failed to create discussion');
      return;
    }
    
    logger.info({ 
      owner, 
      repo, 
      discussionId, 
      discussionNumber, 
      discussionUrl,
      title: discussionTitle 
    }, 'User 2 created new discussion in new repository');
    
    // Step 4: User 1 posts an answer (to earn Galaxy Brain badge)
    const answerBody = `Here's a comprehensive answer to help with this question:

## Solution

This repository provides useful functionality. Here are the key points:

### Main Features
1. **Core Functionality** - Provides essential features
2. **Best Practices** - Follows industry standards
3. **Documentation** - Well-documented codebase

### Getting Started
1. Clone the repository
2. Install dependencies
3. Follow the setup instructions
4. Start using the features

### Best Practices
- Read the documentation
- Follow the coding standards
- Contribute improvements

This should help you get started! Feel free to ask if you need more details.`;

    const answerResult = await octokit.graphql(`
      mutation($discussionId: ID!, $body: String!) {
        addDiscussionComment(input: {
          discussionId: $discussionId
          body: $body
        }) {
          comment {
            id
            body
          }
        }
      }
    `, {
      discussionId: discussionId,
      body: answerBody,
    });
    
    const commentId = answerResult?.addDiscussionComment?.comment?.id;
    logger.info({ 
      owner,
      repo,
      discussionId, 
      discussionNumber,
      commentId 
    }, 'User 1 posted answer in discussion (to earn Galaxy Brain badge)');
    
    // Step 5: User 2 accepts User 1's answer (so User 1 earns the badge!)
    if (commentId && discussionId) {
      // Wait a moment for the comment to be fully processed
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      try {
        await user2Octokit.graphql(`
          mutation($commentId: ID!) {
            markDiscussionCommentAsAnswer(input: {
              id: $commentId
            }) {
              discussion {
                id
                answerChosenAt
              }
            }
          }
        `, {
          commentId: commentId,
        });
        
        logger.info({ 
          owner,
          repo,
          discussionId, 
          discussionNumber,
          commentId 
        }, 'User 2 accepted User 1 answer - Galaxy Brain badge earned for User 1!');
      } catch (acceptErr: any) {
        logger.warn({ 
          err: acceptErr?.message,
          owner,
          repo,
          discussionId,
          commentId 
        }, 'Could not auto-accept answer (may need manual acceptance)');
        logger.info('You may need to manually accept the answer in GitHub Discussions UI');
      }
    }
    
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Could not earn Galaxy Brain badge');
    logger.info('Galaxy Brain badge automation requires:');
    logger.info('1. GITHUB_TOKEN_2 set in .env (second user token)');
    logger.info('2. User 2 must have permission to create repositories');
    logger.info('3. Both tokens have write access');
  }
}

// Cleanup function to delete all repositories created for Galaxy Brain badge
export async function cleanupGalaxyBrainRepos(): Promise<void> {
  if (galaxyBrainRepos.length === 0) {
    logger.info('No Galaxy Brain repositories to clean up');
    return;
  }
  
  logger.info({ count: galaxyBrainRepos.length }, 'Cleaning up Galaxy Brain repositories');
  
  try {
    const user2Octokit = await createUserOctokit2();
    
    for (const { owner, repo } of galaxyBrainRepos) {
      try {
        await deleteRepository(user2Octokit, owner, repo);
        logger.info({ owner, repo }, 'Deleted Galaxy Brain repository');
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err: any) {
        logger.warn({ owner, repo, err: err?.message }, 'Failed to delete repository');
      }
    }
    
    // Clear the list after cleanup
    galaxyBrainRepos.length = 0;
    logger.info('Galaxy Brain repository cleanup complete');
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Failed to cleanup Galaxy Brain repositories');
  }
}
