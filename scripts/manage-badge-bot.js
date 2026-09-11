#!/usr/bin/env node

import { execSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { existsSync, rmSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Function to remove a directory (with retries for Windows)
function removeDirectory(dirPath, maxRetries = 5) {
  if (!existsSync(dirPath)) {
    return; // Directory doesn't exist, nothing to remove
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Try to remove the directory
      if (process.platform === 'win32') {
        // Windows: use rmdir with /s /q flags
        execSync(`rmdir /s /q "${dirPath}"`, { 
          cwd: projectRoot, 
          stdio: 'ignore',
          shell: true 
        });
      } else {
        // Unix-like: use rm -rf
        rmSync(dirPath, { recursive: true, force: true });
      }
      return; // Success
    } catch (err) {
      if (attempt < maxRetries - 1) {
        // Wait a bit before retrying (especially for Windows file locks)
        const delay = (attempt + 1) * 200; // 200ms, 400ms, 600ms, etc.
        try {
          execSync(`timeout /t ${Math.floor(delay / 1000)} /nobreak >nul 2>&1 || sleep ${delay / 1000}`, {
            cwd: projectRoot,
            stdio: 'ignore',
            shell: true
          });
        } catch {
          // Ignore timeout/sleep errors, just wait
          const start = Date.now();
          while (Date.now() - start < delay) {
            // Busy wait
          }
        }
      } else {
        console.warn(`Warning: Could not remove ${dirPath} after ${maxRetries} attempts. Continuing anyway...`);
      }
    }
  }
}

// Step 1: Remove and reinstall github-badge-bot module
console.log('🔄 Reloading github-badge-bot module...');

try {
  const badgeBotPath = join(projectRoot, 'node_modules', 'github-badge-bot');
  
  // Remove the module
  console.log('   Removing old github-badge-bot...');
  removeDirectory(badgeBotPath);
  
  // Wait a moment to ensure file system is ready
  if (process.platform === 'win32') {
    try {
      execSync('timeout /t 1 /nobreak >nul 2>&1', { shell: true });
    } catch {
      // Ignore
    }
  } else {
    try {
      execSync('sleep 1', { shell: true });
    } catch {
      // Ignore
    }
  }
  
  // Reinstall the module
  console.log('   Installing latest github-badge-bot...');
  execSync('npm install github-badge-bot@latest', {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true
  });
  
  console.log('✅ github-badge-bot module reloaded successfully!\n');
} catch (err) {
  console.warn('⚠️  Warning: Could not reload github-badge-bot module:', err.message);
  console.warn('   Continuing with existing installation...\n');
}

// Step 2: Start the main application
console.log('🚀 Starting application...\n');

const args = process.argv.slice(2);
const command = args.join(' ');

if (command) {
  execSync(command, { 
    cwd: projectRoot, 
    stdio: 'inherit',
    shell: true 
  });
} else {
  // Default to tsx src/index.ts
  execSync('tsx src/index.ts', { 
    cwd: projectRoot, 
    stdio: 'inherit',
    shell: true 
  });
}

