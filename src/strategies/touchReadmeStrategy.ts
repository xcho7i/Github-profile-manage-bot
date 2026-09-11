import { Strategy, StrategyContext, StrategyRunResult } from '../types.js';

export const touchReadmeStrategy: Strategy = {
  name: 'touch-readme',

  generateBranchName(context: StrategyContext): string {
    const now = new Date().toISOString().replace(/[:.]/g, '-');
    return `${context.workingBranchPrefix}${this.name}-${now}`;
  },

  async run(_context: StrategyContext): Promise<StrategyRunResult> {
    const timestamp = new Date().toISOString();
    const content = `Updated by bot at ${timestamp}\n`;
    return {
      hasChanges: true,
      title: 'chore: automated README touch',
      body: 'This PR updates README.md with a fresh timestamp to demonstrate automation.',
      files: [
        {
          path: 'README.md',
          content,
        },
      ],
    };
  },
};

