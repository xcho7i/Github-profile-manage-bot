#!/usr/bin/env node

import dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function checkBadges() {
  console.log('=== Checking Your GitHub Badges ===\n');
  
  if (!process.env.GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN not found in .env');
    return;
  }
  
  if (!process.env.GITHUB_OWNER) {
    console.error('❌ GITHUB_OWNER not found in .env');
    return;
  }
  
  if (!process.env.GITHUB_REPO) {
    console.error('❌ GITHUB_REPO not found in .env');
    return;
  }
  
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  
  try {
    // Get user info
    const user = await octokit.users.getAuthenticated();
    console.log(`👤 Checking badges for: ${user.data.login}\n`);
    
    // Check Pull Shark (merged PRs)
    console.log('📊 Pull Shark Badge (Merged Pull Requests):');
    const mergedPRs = await octokit.pulls.list({
      owner,
      repo,
      state: 'closed',
      per_page: 100,
    });
    const mergedCount = mergedPRs.data.filter(pr => pr.merged_at).length;
    const pullSharkLevel = Math.min(Math.floor(mergedCount / 2), 4); // 2 PRs per level, max x4
    console.log(`   Merged PRs: ${mergedCount}`);
    console.log(`   Estimated level: ${pullSharkLevel > 0 ? `x${pullSharkLevel}` : 'Not earned'}\n`);
    
    // Check Pair Extraordinaire (co-authored commits)
    console.log('🤝 Pair Extraordinaire Badge (Co-authored Commits):');
    // This is harder to check via API, but we can check if co-author is enabled
    const coAuthorEnabled = process.env.CO_AUTHOR_ENABLED === 'true';
    console.log(`   Co-author enabled: ${coAuthorEnabled ? 'Yes' : 'No'}`);
    console.log(`   Note: Check your profile for this badge\n`);
    
    // Check YOLO (auto-merged PRs)
    console.log('🎲 YOLO Badge (Auto-merged PRs):');
    const autoMergedCount = mergedPRs.data.filter(pr => pr.merged_at && pr.auto_merge).length;
    const yoloLevel = Math.min(Math.floor(autoMergedCount / 2), 4);
    console.log(`   Auto-merged PRs: ${autoMergedCount}`);
    console.log(`   Estimated level: ${yoloLevel > 0 ? `x${yoloLevel}` : 'Not earned'}\n`);
    
    // Check Quickdraw (fast reviews)
    console.log('⚡ Quickdraw Badge (Fast Reviews):');
    console.log(`   Note: Requires reviewing PRs within 1 hour\n`);
    
    // Check Starstruck (stars)
    console.log('⭐ Starstruck Badge (Repository Stars):');
    const repoInfo = await octokit.repos.get({ owner, repo });
    const stars = repoInfo.data.stargazers_count;
    const starstruckLevel = stars >= 16 ? 4 : stars >= 8 ? 3 : stars >= 4 ? 2 : stars >= 1 ? 1 : 0;
    console.log(`   Repository stars: ${stars}`);
    console.log(`   Estimated level: ${starstruckLevel > 0 ? `x${starstruckLevel}` : 'Not earned'}\n`);
    
    // Check Galaxy Brain (accepted answers in discussions)
    console.log('🧠 Galaxy Brain Badge (Accepted Answers in Discussions):');
    try {
      const discussions = await octokit.graphql(`
        query($owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) {
            discussions(first: 100) {
              nodes {
                answerChosenAt
                answerChosenBy {
                  login
                }
              }
            }
          }
        }
      `, {
        owner,
        repo,
      });
      
      const acceptedAnswers = discussions?.repository?.discussions?.nodes?.filter(
        d => d.answerChosenAt !== null && d.answerChosenBy?.login === owner
      ).length || 0;
      
      // Galaxy Brain badge tiers: Bronze (2), Silver (8), Gold (16), Platinum (32)
      let galaxyBrainLevel = 0;
      if (acceptedAnswers >= 32) galaxyBrainLevel = 4; // Platinum
      else if (acceptedAnswers >= 16) galaxyBrainLevel = 3; // Gold
      else if (acceptedAnswers >= 8) galaxyBrainLevel = 2; // Silver
      else if (acceptedAnswers >= 2) galaxyBrainLevel = 1; // Bronze
      console.log(`   Accepted answers: ${acceptedAnswers}`);
      console.log(`   Estimated level: ${galaxyBrainLevel > 0 ? `x${galaxyBrainLevel}` : 'Not earned'}\n`);
      
      if (acceptedAnswers === 0) {
        console.log('   💡 To earn Galaxy Brain badge:');
        console.log('      1. Enable Discussions in repository settings');
        console.log('      2. Create discussions and post answers');
        console.log('      3. Have answers accepted by discussion author');
        console.log('      4. Run the bot to automate this process\n');
      }
    } catch (err) {
      console.log(`   ⚠️  Could not check discussions: ${err.message}`);
      console.log('      Make sure Discussions are enabled in repository settings\n');
    }
    
    // Summary
    console.log('=== Summary ===');
    console.log('📌 Note: GitHub badges are displayed on your profile automatically.');
    console.log('📌 Badges appear at: https://github.com/' + owner);
    console.log('📌 Go to your profile and scroll to "Achievements" section\n');
    
    console.log('💡 Badge Display Settings:');
    console.log('   GitHub badges are automatically displayed on your profile.');
    console.log('   There is no setting to hide/show individual badges.');
    console.log('   If you earned a badge, it will appear automatically.\n');
    
  } catch (err) {
    console.error('❌ Error checking badges:', err.message);
    if (err.message.includes('Not Found')) {
      console.log('\n💡 Make sure:');
      console.log('   1. GITHUB_TOKEN has correct permissions');
      console.log('   2. Repository exists and is accessible');
      console.log('   3. You have access to the repository');
    }
  }
}

checkBadges().catch(console.error);

