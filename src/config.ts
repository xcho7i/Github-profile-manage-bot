import dotenv from 'dotenv';
dotenv.config();

export const config = {
  githubToken: process.env.GITHUB_TOKEN ?? '',
  githubToken2: process.env.GITHUB_TOKEN_2 ?? '', // Second token for collaboration (Galaxy Brain badge)
  owner: process.env.GITHUB_OWNER ?? '',
  repo: process.env.GITHUB_REPO ?? '',
  defaultBranch: process.env.DEFAULT_BRANCH ?? 'main',
  workingBranchPrefix: process.env.WORKING_BRANCH_PREFIX ?? 'bot/',
  scheduleSeconds: Number(process.env.SCHEDULE_SECONDS ?? '1800'),
  masterIntervalSeconds: Number(process.env.MASTER_INTERVAL_SECONDS ?? process.env.SCHEDULE_SECONDS ?? '60'),
  issueIntervalSeconds: Number(process.env.ISSUE_INTERVAL_SECONDS ?? process.env.SCHEDULE_SECONDS ?? '60'),
  autoMerge: (process.env.AUTO_MERGE ?? 'false').toLowerCase() === 'true',
  mergeMethod: (process.env.MERGE_METHOD ?? 'squash') as 'merge' | 'squash' | 'rebase',
  creditFooter: process.env.CREDIT_FOOTER ?? 'Automated by PR Bot',
  creditsFilePath: process.env.CREDITS_FILE_PATH ?? 'CREDITS.md',
  issueEnabled: (process.env.ISSUE_FLOW ?? 'false').toLowerCase() === 'true',
  issueLabel: process.env.ISSUE_LABEL ?? 'virtual-certificate',
  issueTitleTemplate: process.env.ISSUE_TITLE_TMPL ?? 'Virtual Certificate: ${timestamp}',
  issueBodyTemplate:
    process.env.ISSUE_BODY_TMPL ??
    'This is an automated virtual certificate entry created at ${timestamp}.',
  autoReview: (process.env.AUTO_REVIEW ?? 'true').toLowerCase() === 'true',
  reviewEvent: (process.env.REVIEW_EVENT ?? 'APPROVE') as 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES',
  reviewBody: process.env.REVIEW_BODY ?? 'Automated review by PR Bot.',
  reviewFlowEnabled: (process.env.REVIEW_FLOW ?? 'true').toLowerCase() === 'true',
  reviewIntervalSeconds: Number(process.env.REVIEW_INTERVAL_SECONDS ?? '300'),
  reviewMaxPerRun: Number(process.env.REVIEW_MAX_PER_RUN ?? '5'),
  reviewOnly: (process.env.REVIEW_ONLY ?? 'false').toLowerCase() === 'true',
  reviewAsUser: (process.env.REVIEW_AS_USER ?? 'false').toLowerCase() === 'true',
  // "YOLO badge" (optional): label + comment after successful auto-merge
  yoloBadgeEnabled: (process.env.YOLO_BADGE_ENABLED ?? 'false').toLowerCase() === 'true',
  yoloBadgeLabel: process.env.YOLO_BADGE_LABEL ?? 'yolo',
  yoloBadgeLabelColor: process.env.YOLO_BADGE_LABEL_COLOR ?? 'fbca04',
  yoloBadgeShieldUrl: process.env.YOLO_BADGE_SHIELD_URL ?? 'https://img.shields.io/badge/YOLO-auto--merged-fbca04',
  yoloBadgeCommentText: process.env.YOLO_BADGE_COMMENT_TEXT ?? 'YOLO badge earned: auto-merged by PR Bot.',
  // GitHub App auth (optional)
  appId: process.env.GH_APP_ID ?? '',
  installationId: process.env.GH_INSTALLATION_ID ?? '',
  appPrivateKey: process.env.GH_APP_PRIVATE_KEY ?? '',
  // Commit message templates
  commitMessageTemplate: process.env.COMMIT_MESSAGE_TEMPLATE ?? 'chore: automated update',
  masterCommitMessageTemplate: process.env.MASTER_COMMIT_MESSAGE_TEMPLATE ?? 'chore: append space to test.txt',
  creditsCommitMessageTemplate: process.env.CREDITS_COMMIT_MESSAGE_TEMPLATE ?? 'docs: update credits file',
  // Co-author configuration for "Pair Extraordinaire" badge
  coAuthorEnabled: (process.env.CO_AUTHOR_ENABLED ?? 'false').toLowerCase() === 'true',
  coAuthorName: process.env.CO_AUTHOR_NAME ?? '',
  coAuthorEmail: process.env.CO_AUTHOR_EMAIL ?? '',
  // Badge management configuration
  badgeManagementEnabled: (process.env.BADGE_MANAGEMENT_ENABLED ?? 'false').toLowerCase() === 'true',
  badgeManagementIntervalSeconds: Number(process.env.BADGE_MANAGEMENT_INTERVAL_SECONDS ?? '3600'),
  badgeTargetCount: Number(process.env.BADGE_TARGET_COUNT ?? '4'),
};

export function validateConfig(): void {
  const missing: string[] = [];
  if (!config.githubToken) missing.push('GITHUB_TOKEN');
  if (!config.owner) missing.push('GITHUB_OWNER');
  if (!config.repo) missing.push('GITHUB_REPO');

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

/**
 * Processes a commit message template by replacing variables.
 * Supported variables:
 * - ${timestamp}: ISO timestamp
 * - ${random}: Random alphanumeric string (6 chars)
 * - ${date}: Date in YYYY-MM-DD format
 * - ${time}: Time in HH:MM:SS format
 */
export function processCommitMessageTemplate(template: string): string {
  const timestamp = new Date().toISOString();
  const date = new Date();
  const random = Math.random().toString(36).slice(2, 8);
  const dateStr = date.toISOString().split('T')[0];
  const timeStr = date.toTimeString().split(' ')[0];

  return template
    .replace(/\$\{timestamp\}/g, timestamp)
    .replace(/\$\{random\}/g, random)
    .replace(/\$\{date\}/g, dateStr)
    .replace(/\$\{time\}/g, timeStr);
}

/**
 * Appends a co-author trailer to a commit message for the "Pair Extraordinaire" badge.
 * The co-author must be configured via CO_AUTHOR_ENABLED, CO_AUTHOR_NAME, and CO_AUTHOR_EMAIL.
 */
export function appendCoAuthor(message: string): string {
  if (!config.coAuthorEnabled || !config.coAuthorName || !config.coAuthorEmail) {
    return message;
  }

  // Check if co-author is already present
  if (message.includes('Co-authored-by:')) {
    return message;
  }

  // Append co-author trailer (Git convention: blank line before trailers)
  const trimmed = message.trimEnd();
  const hasNewline = trimmed.endsWith('\n');
  const separator = hasNewline ? '' : '\n';
  return `${trimmed}${separator}\nCo-authored-by: ${config.coAuthorName} <${config.coAuthorEmail}>`;
}

