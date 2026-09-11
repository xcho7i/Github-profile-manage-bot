#!/usr/bin/env node

import dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

async function checkGalaxyBrainDetailed() {
  console.log('=== Detailed Galaxy Brain Badge Check ===\n');
  
  if (!process.env.GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN not found in .env');
    return;
  }
  
  if (!process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) {
    console.error('❌ Repository info not found in .env');
    return;
  }
  
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  
  try {
    // Check repository visibility
    const repoInfo = await octokit.repos.get({ owner, repo });
    console.log(`📦 Repository: ${owner}/${repo}`);
    console.log(`   Visibility: ${repoInfo.data.private ? '🔒 PRIVATE' : '🌐 PUBLIC'}`);
    console.log(`   Discussions enabled: ${repoInfo.data.has_discussions ? 'Yes ✅' : 'No ❌'}\n`);
    
    if (repoInfo.data.private) {
      console.log('⚠️  WARNING: Repository is PRIVATE!');
      console.log('   Galaxy Brain badge ONLY counts for PUBLIC repositories.\n');
      console.log('💡 Solution: Make the repository public or use a public repository.\n');
    }
    
    // Get user info
    const user = await octokit.users.getAuthenticated();
    console.log(`👤 Checking for user: ${user.data.login}\n`);
    
    // Check discussions with detailed info
    console.log('🔍 Checking Discussions:\n');
    const discussions = await octokit.graphql(`
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          isPrivate
          discussions(first: 100) {
            totalCount
            nodes {
              id
              number
              title
              answerChosenAt
              answerChosenBy {
                login
              }
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
      owner,
      repo,
    });
    
    const repoData = discussions?.repository;
    console.log(`   Total discussions: ${repoData?.discussions?.totalCount || 0}`);
    console.log(`   Repository is private: ${repoData?.isPrivate ? 'Yes ❌' : 'No ✅'}\n`);
    
    if (repoData?.isPrivate) {
      console.log('❌ CRITICAL: Repository is PRIVATE!');
      console.log('   Galaxy Brain badge requires PUBLIC repository discussions.\n');
      return;
    }
    
    const allDiscussions = repoData?.discussions?.nodes || [];
    const discussionsWithAnswers = allDiscussions.filter(d => d.answerChosenAt !== null);
    
    console.log(`   Discussions with accepted answers: ${discussionsWithAnswers.length}\n`);
    
    // Check each discussion
    let validAnswers = 0;
    let invalidAnswers = 0;
    
    for (const discussion of discussionsWithAnswers) {
      const acceptedBy = discussion.answerChosenBy?.login;
      const answerComment = discussion.comments?.nodes?.find(c => c.isAnswer);
      const answerAuthor = answerComment?.author?.login;
      
      console.log(`   Discussion #${discussion.number}: "${discussion.title}"`);
      console.log(`      Answer author: ${answerAuthor || 'Unknown'}`);
      console.log(`      Accepted by: ${acceptedBy || 'Unknown'}`);
      
      // Galaxy Brain counts when YOU provide the answer (not when you accept it)
      if (answerAuthor === owner) {
        validAnswers++;
        console.log(`      ✅ Counts for Galaxy Brain badge`);
      } else {
        invalidAnswers++;
        console.log(`      ❌ Doesn't count (you didn't provide the answer)`);
      }
      console.log('');
    }
    
    console.log('=== Summary ===\n');
    console.log(`✅ Valid answers (you provided): ${validAnswers}`);
    console.log(`❌ Invalid answers (you accepted but didn't provide): ${invalidAnswers}\n`);
    
    // Galaxy Brain badge tiers
    let badgeLevel = 0;
    if (validAnswers >= 32) badgeLevel = 4; // Platinum
    else if (validAnswers >= 16) badgeLevel = 3; // Gold
    else if (validAnswers >= 8) badgeLevel = 2; // Silver
    else if (validAnswers >= 2) badgeLevel = 1; // Bronze
    
    console.log(`🧠 Galaxy Brain Badge Status:`);
    if (badgeLevel > 0) {
      console.log(`   Level: x${badgeLevel} (${['Bronze', 'Silver', 'Gold', 'Platinum'][badgeLevel - 1]})`);
      console.log(`   ✅ You should have this badge!`);
      if (!repoInfo.data.private) {
        console.log(`   ⏳ If badge not visible, wait 24 hours for GitHub sync`);
      }
    } else {
      console.log(`   ❌ Not earned yet`);
      console.log(`   Need: ${2 - validAnswers} more valid answers`);
    }
    
    console.log('\n💡 Important Notes:');
    console.log('   - Galaxy Brain counts ANSWERS YOU PROVIDED (not answers you accepted)');
    console.log('   - Repository MUST be PUBLIC');
    console.log('   - Answers must be accepted by discussion author');
    console.log('   - Badge sync can take up to 24 hours\n');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.message.includes('Not Found')) {
      console.log('\n💡 Make sure:');
      console.log('   1. Repository exists and is accessible');
      console.log('   2. Discussions are enabled');
      console.log('   3. Token has correct permissions');
    }
  }
}

checkGalaxyBrainDetailed().catch(console.error);

