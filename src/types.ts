export type StrategyRunResult = {
  hasChanges: boolean;
  title?: string;
  body?: string;
  files?: Array<{ path: string; content: string }>;
};

export interface StrategyContext {
  owner: string;
  repo: string;
  defaultBranch: string;
  workingBranchPrefix: string;
}

export interface Strategy {
  name: string;
  generateBranchName(context: StrategyContext): string;
  run(context: StrategyContext): Promise<StrategyRunResult>;
}

