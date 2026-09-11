#!/usr/bin/env node

/**
 * Script to automatically add GitHub Topics to the repository
 * This automates the manual process of adding topics via the GitHub UI
 */

import dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';

dotenv.config();

const config = {
  githubToken: process.env.GITHUB_TOKEN ?? '',
  owner: process.env.GITHUB_OWNER ?? '',
  repo: process.env.GITHUB_REPO ?? '',
};

// Topics to add to the repository
const TOPICS = [
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
];

async function addGitHubTopics() {
  // Validate configuration
  if (!config.githubToken) {
    console.error('❌ Error: GITHUB_TOKEN is not set in .env file');
    process.exit(1);
  }

  if (!config.owner || !config.repo) {
    console.error('❌ Error: GITHUB_OWNER and GITHUB_REPO must be set in .env file');
    process.exit(1);
  }

  const octokit = new Octokit({ auth: config.githubToken });

  try {
    console.log(`📋 Adding topics to ${config.owner}/${config.repo}...`);
    console.log(`📌 Topics to add: ${TOPICS.join(', ')}\n`);

    // Get current topics first
    let currentTopics = [];
    try {
      const { data } = await octokit.repos.getAllTopics({
        owner: config.owner,
        repo: config.repo,
      });
      currentTopics = data.names || [];
      console.log(`📊 Current topics: ${currentTopics.length > 0 ? currentTopics.join(', ') : 'None'}`);
    } catch (err) {
      if (err?.status === 404) {
        console.error(`❌ Repository ${config.owner}/${config.repo} not found or you don't have access`);
        process.exit(1);
      }
      console.warn(`⚠️  Could not fetch current topics: ${err?.message}`);
    }

    // Merge current topics with new topics (avoid duplicates)
    const allTopics = [...new Set([...currentTopics, ...TOPICS])];
    
    // Check if topics are already set
    const newTopics = TOPICS.filter(topic => !currentTopics.includes(topic));
    
    if (newTopics.length === 0) {
      console.log('✅ All topics are already set!');
      return;
    }

    console.log(`\n➕ Adding ${newTopics.length} new topic(s): ${newTopics.join(', ')}`);

    // Add topics using the GitHub API
    await octokit.repos.replaceAllTopics({
      owner: config.owner,
      repo: config.repo,
      names: allTopics,
    });

    console.log(`\n✅ Successfully added topics to ${config.owner}/${config.repo}!`);
    console.log(`📌 Total topics: ${allTopics.join(', ')}`);

    // Verify by fetching topics again
    try {
      const { data } = await octokit.repos.getAllTopics({
        owner: config.owner,
        repo: config.repo,
      });
      console.log(`\n✅ Verified: Repository now has ${data.names.length} topic(s)`);
    } catch (err) {
      console.warn(`⚠️  Could not verify topics: ${err?.message}`);
    }

  } catch (err) {
    if (err?.status === 401) {
      console.error('❌ Authentication failed. Please check your GITHUB_TOKEN.');
      console.error('   Make sure your token has the "public_repo" or "repo" scope.');
    } else if (err?.status === 403) {
      console.error('❌ Access forbidden. Your token may not have permission to modify repository topics.');
      console.error('   Required scope: "public_repo" (for public repos) or "repo" (for private repos)');
    } else if (err?.status === 404) {
      console.error(`❌ Repository ${config.owner}/${config.repo} not found or you don't have access`);
    } else {
      console.error(`❌ Error adding topics: ${err?.message}`);
      if (err?.response?.data) {
        console.error('   Details:', JSON.stringify(err.response.data, null, 2));
      }
    }
    process.exit(1);
  }
}

// Run the script
addGitHubTopics().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

