#!/usr/bin/env node

import dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

async function testGraphQL() {
  console.log('=== Testing GraphQL API Access ===\n');
  
  // Test User 1 Token
  console.log('1. Testing User 1 (GITHUB_TOKEN)...');
  if (!process.env.GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN not found in .env');
    return;
  }
  
  try {
    const octokit1 = new Octokit({ auth: process.env.GITHUB_TOKEN });
    
    // Test basic GraphQL query
    const result1 = await octokit1.graphql(`
      query {
        viewer {
          login
          id
        }
      }
    `);
    
    console.log(`✅ User 1 authenticated as: ${result1.viewer.login}`);
    
    // Test Discussions query
    if (process.env.GITHUB_OWNER && process.env.GITHUB_REPO) {
      try {
        const discussions = await octokit1.graphql(`
          query($owner: String!, $repo: String!) {
            repository(owner: $owner, name: $repo) {
              id
              name
              hasDiscussionsEnabled
              discussionCategories(first: 5) {
                nodes {
                  id
                  name
                }
              }
            }
          }
        `, {
          owner: process.env.GITHUB_OWNER,
          repo: process.env.GITHUB_REPO,
        });
        
        console.log(`✅ Repository found: ${discussions.repository.name}`);
        console.log(`   Discussions enabled: ${discussions.repository.hasDiscussionsEnabled}`);
        console.log(`   Categories: ${discussions.repository.discussionCategories.nodes.length}`);
      } catch (err) {
        console.error(`❌ Repository GraphQL query failed: ${err.message}`);
        if (err.message.includes('discussion')) {
          console.log('   → Discussions may not be enabled or token lacks write:discussion scope');
        }
      }
    }
  } catch (err) {
    console.error(`❌ User 1 GraphQL test failed: ${err.message}`);
    console.log('   → Check token permissions (needs repo + write:discussion scopes)');
  }
  
  console.log('\n2. Testing User 2 (GITHUB_TOKEN_2)...');
  if (!process.env.GITHUB_TOKEN_2) {
    console.error('❌ GITHUB_TOKEN_2 not found in .env');
    console.log('   → Add GITHUB_TOKEN_2 to your .env file');
    return;
  }
  
  try {
    const octokit2 = new Octokit({ auth: process.env.GITHUB_TOKEN_2 });
    
    const result2 = await octokit2.graphql(`
      query {
        viewer {
          login
          id
        }
      }
    `);
    
    console.log(`✅ User 2 authenticated as: ${result2.viewer.login}`);
  } catch (err) {
    console.error(`❌ User 2 GraphQL test failed: ${err.message}`);
    console.log('   → Check token permissions (needs repo + write:discussion scopes)');
  }
  
  console.log('\n=== Test Complete ===');
  console.log('\nIf both tests passed, GraphQL API access is working!');
  console.log('If tests failed, check:');
  console.log('1. Token has "repo" scope');
  console.log('2. Token has "write:discussion" scope');
  console.log('3. Discussions enabled in repository');
}

testGraphQL().catch(console.error);

