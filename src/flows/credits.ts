import { createOctokit, getTextFileAtRef, commitFiles } from '../github.js';
import { config, processCommitMessageTemplate } from '../config.js';

export async function ensureCreditsOnBranch(branch: string): Promise<void> {
  const octokit = await createOctokit();
  const existing = (await getTextFileAtRef(octokit, config.creditsFilePath, branch)) ?? '';
  const creditLine = `This repository uses an automated PR bot. ${config.creditFooter}`;
  const next = existing.includes(creditLine)
    ? existing
    : (existing ? existing + '\n' : '') + creditLine + '\n';
  if (next !== existing) {
    const commitMessage = processCommitMessageTemplate(config.creditsCommitMessageTemplate);
    await commitFiles(
      octokit,
      branch,
      [{ path: config.creditsFilePath, content: next }],
      commitMessage,
    );
  }
}

