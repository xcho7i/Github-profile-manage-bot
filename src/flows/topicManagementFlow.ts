import { createOctokit, addRepositoryTopics } from '../github.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// List of topics to add gradually (one per hour)
const TOPICS_TO_ADD = [
  'github-bot',
  'automation',
  'badge-management',
  'github-badges',
  'nodejs',
  'typescript',
  'github-api',
  'pull-requests',
  'open-source',
  'developer-tools',
  'github-automation',
  'workflow-automation',
  'ci-cd',
  'github-actions',
  'bot-framework',
];

// File to track which topics have been added
const TOPICS_STATE_FILE = join(process.cwd(), '.topics-state.json');

interface TopicsState {
  addedTopics: string[];
  lastAddedAt?: string;
}

function loadTopicsState(): TopicsState {
  try {
    if (existsSync(TOPICS_STATE_FILE)) {
      const content = readFileSync(TOPICS_STATE_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Could not load topics state file');
  }
  return { addedTopics: [] };
}

function saveTopicsState(state: TopicsState): void {
  try {
    writeFileSync(TOPICS_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Could not save topics state file');
  }
}

/**
 * Adds one new topic to the repository if enough time has passed (1 hour)
 * This runs gradually to avoid adding all topics at once
 */
export async function addTopicHourly(): Promise<void> {
  try {
    const octokit = await createOctokit();
    
    // Get current topics from GitHub
    let currentTopics: string[] = [];
    try {
      const { data } = await octokit.repos.getAllTopics({
        owner: config.owner,
        repo: config.repo,
      });
      currentTopics = data.names || [];
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Could not fetch current topics from GitHub');
      return;
    }

    // Load state
    const state = loadTopicsState();
    const now = new Date();
    
    // Check if we should add a topic (at least 1 hour since last addition)
    if (state.lastAddedAt) {
      const lastAdded = new Date(state.lastAddedAt);
      const hoursSinceLastAdd = (now.getTime() - lastAdded.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceLastAdd < 1) {
        const minutesRemaining = Math.ceil(60 - (hoursSinceLastAdd * 60));
        logger.debug({ 
          minutesRemaining,
          lastAdded: state.lastAddedAt 
        }, 'Topic addition skipped - less than 1 hour since last addition');
        return;
      }
    }

    // Find next topic to add (not already in current topics and not in state)
    const topicsToAdd = TOPICS_TO_ADD.filter(
      topic => !currentTopics.includes(topic) && !state.addedTopics.includes(topic)
    );

    if (topicsToAdd.length === 0) {
      logger.info({ 
        currentTopics: currentTopics.length,
        totalTopics: TOPICS_TO_ADD.length 
      }, 'All topics have been added or are already present');
      return;
    }

    // Add the first topic that hasn't been added yet
    const topicToAdd = topicsToAdd[0];
    logger.info({ 
      topic: topicToAdd,
      remaining: topicsToAdd.length - 1 
    }, 'Adding new topic to repository (hourly addition)');

    // Add the topic
    await addRepositoryTopics(octokit, config.owner, config.repo, [topicToAdd]);

    // Update state
    state.addedTopics.push(topicToAdd);
    state.lastAddedAt = now.toISOString();
    saveTopicsState(state);

    logger.info({ 
      topic: topicToAdd,
      totalAdded: state.addedTopics.length,
      remaining: topicsToAdd.length - 1 
    }, 'Successfully added topic (hourly addition)');

  } catch (err: any) {
    logger.error({ err: err?.message, stack: err?.stack }, 'Failed to add topic hourly');
  }
}

/**
 * Initialize topic management - adds all topics immediately on first run
 * Then switches to hourly additions
 */
export async function initializeTopicManagement(): Promise<void> {
  try {
    const octokit = await createOctokit();
    
    // Get current topics from GitHub
    let currentTopics: string[] = [];
    try {
      const { data } = await octokit.repos.getAllTopics({
        owner: config.owner,
        repo: config.repo,
      });
      currentTopics = data.names || [];
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Could not fetch current topics for initialization');
      return;
    }

    // Load state
    const state = loadTopicsState();
    
    // If no topics have been added yet, add the first one immediately
    if (state.addedTopics.length === 0 && currentTopics.length === 0) {
      const firstTopic = TOPICS_TO_ADD[0];
      logger.info({ topic: firstTopic }, 'Initializing topic management - adding first topic');
      
      await addRepositoryTopics(octokit, config.owner, config.repo, [firstTopic]);
      
      state.addedTopics.push(firstTopic);
      state.lastAddedAt = new Date().toISOString();
      saveTopicsState(state);
      
      logger.info({ 
        topic: firstTopic,
        nextTopicIn: '1 hour'
      }, 'Topic management initialized - next topic will be added in 1 hour');
    } else {
      logger.debug({ 
        currentTopics: currentTopics.length,
        trackedTopics: state.addedTopics.length 
      }, 'Topic management already initialized');
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Failed to initialize topic management');
  }
}

