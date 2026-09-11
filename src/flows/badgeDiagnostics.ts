import { createOctokit, createUserOctokit2, getCoreRateLimit } from '../github.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

export async function diagnoseGalaxyBrainBadge(): Promise<void> {
  logger.info('=== Galaxy Brain Badge Diagnostics ===');
  
  // Check 1: Badge management enabled
  logger.info({ badgeManagementEnabled: config.badgeManagementEnabled }, 'Check 1: Badge management enabled');
  if (!config.badgeManagementEnabled) {
    logger.error('❌ BADGE_MANAGEMENT_ENABLED is not set to true');
    logger.info('Fix: Add BADGE_MANAGEMENT_ENABLED=true to your .env file');
    return;
  }
  logger.info('✅ Badge management is enabled');
  
  // Check 2: GITHUB_TOKEN_2 configured
  logger.info({ hasToken2: !!config.githubToken2 }, 'Check 2: GITHUB_TOKEN_2 configured');
  if (!config.githubToken2) {
    logger.error('❌ GITHUB_TOKEN_2 is not configured');
    logger.info('Fix: Add GITHUB_TOKEN_2=your_second_token to your .env file');
    return;
  }
  logger.info('✅ GITHUB_TOKEN_2 is configured');
  
  // Check 3: Repository configuration
  logger.info({ owner: config.owner, repo: config.repo }, 'Check 3: Repository configuration');
  if (!config.owner || !config.repo) {
    logger.error('❌ Repository not configured');
    logger.info('Fix: Set GITHUB_OWNER and GITHUB_REPO in your .env file');
    return;
  }
  logger.info('✅ Repository is configured');
  
  // Check 4: Test API access with User 1
  logger.info('Check 4: Testing User 1 API access...');
  try {
    const octokit1 = await createOctokit();
    const { remaining } = await getCoreRateLimit(octokit1);
    logger.info({ rateLimitRemaining: remaining }, '✅ User 1 API access working');
    
    // Check if repo exists
    try {
      const repo = await octokit1.repos.get({ owner: config.owner, repo: config.repo });
      logger.info({ 
        repoExists: true, 
        defaultBranch: repo.data.default_branch,
        hasDiscussions: repo.data.has_discussions 
      }, 'Repository info');
      
      if (!repo.data.has_discussions) {
        logger.error('❌ Discussions are NOT enabled in repository');
        logger.info('Fix: Go to repo Settings → General → Features → Enable "Discussions"');
        return;
      }
      logger.info('✅ Discussions are enabled in repository');
    } catch (err: any) {
      logger.error({ err: err?.message }, '❌ Cannot access repository');
      return;
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, '❌ User 1 API access failed');
    return;
  }
  
  // Check 5: Test API access with User 2
  logger.info('Check 5: Testing User 2 API access...');
  try {
    const octokit2 = await createUserOctokit2();
    const { remaining } = await getCoreRateLimit(octokit2);
    logger.info({ rateLimitRemaining: remaining }, '✅ User 2 API access working');
    
    // Get User 2 info
    try {
      const user2 = await octokit2.users.getAuthenticated();
      logger.info({ user2Login: user2.data.login }, 'User 2 authenticated');
    } catch (err: any) {
      logger.error({ err: err?.message }, '❌ User 2 authentication failed');
      return;
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, '❌ User 2 API access failed');
    logger.info('Fix: Check GITHUB_TOKEN_2 is valid and has correct permissions');
    return;
  }
  
  // Check 6: Test GraphQL access for Discussions
  logger.info('Check 6: Testing GraphQL Discussions API...');
  try {
    const octokit1 = await createOctokit();
    const result: any = await octokit1.graphql(`
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
          name
          hasDiscussionsEnabled
          discussionCategories(first: 5) {
            nodes {
              id
              name
              emoji
            }
          }
          discussions(first: 5) {
            totalCount
            nodes {
              id
              title
              number
              answerChosenAt
            }
          }
        }
      }
    `, {
      owner: config.owner,
      repo: config.repo,
    });
    
    const repo = result?.repository;
    if (!repo) {
      logger.error('❌ GraphQL query returned no repository data');
      return;
    }
    
    logger.info({ 
      hasDiscussionsEnabled: repo.hasDiscussionsEnabled,
      categoriesCount: repo.discussionCategories?.nodes?.length || 0,
      discussionsCount: repo.discussions?.totalCount || 0
    }, 'Discussions API info');
    
    if (!repo.hasDiscussionsEnabled) {
      logger.error('❌ Discussions are NOT enabled (GraphQL check)');
      logger.info('Fix: Enable Discussions in repository settings');
      return;
    }
    
    if (!repo.discussionCategories?.nodes || repo.discussionCategories.nodes.length === 0) {
      logger.error('❌ No discussion categories found');
      logger.info('Fix: Enable Discussions and ensure at least one category exists');
      return;
    }
    
    logger.info({ categories: repo.discussionCategories.nodes.map((c: any) => c.name) }, 'Available discussion categories');
    logger.info('✅ GraphQL Discussions API is working');
    
  } catch (err: any) {
    logger.error({ err: err?.message, errStack: err?.stack }, '❌ GraphQL Discussions API failed');
    if (err?.message?.includes('GraphQL')) {
      logger.info('Possible issues:');
      logger.info('1. GraphQL API not available for your token');
      logger.info('2. Token lacks "write:discussion" permission');
      logger.info('3. Discussions not enabled in repository');
    }
    return;
  }
  
  // Check 7: Test creating a discussion (dry run)
  logger.info('Check 7: Testing discussion creation capability...');
  try {
    const octokit1 = await createOctokit();
    const result: any = await octokit1.graphql(`
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
          discussionCategories(first: 1) {
            nodes {
              id
              name
            }
          }
        }
      }
    `, {
      owner: config.owner,
      repo: config.repo,
    });
    
    const categoryId = result?.repository?.discussionCategories?.nodes?.[0]?.id;
    if (categoryId) {
      logger.info({ categoryId, categoryName: result.repository.discussionCategories.nodes[0].name }, '✅ Can create discussions (category available)');
    } else {
      logger.error('❌ No discussion category available for creating discussions');
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, '❌ Cannot verify discussion creation capability');
  }
  
  logger.info('=== Diagnostics Complete ===');
  logger.info('If all checks passed, the bot should be able to earn Galaxy Brain badge.');
  logger.info('Run the badge management flow to start earning badges.');
}

