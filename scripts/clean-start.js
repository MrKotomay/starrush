/**
 * Clean start script - removes stale lock files before starting dev server
 */
const fs = require('fs');
const path = require('path');

const lockPath = path.join(__dirname, '..', '.next', 'dev', 'lock');
const nextDir = path.join(__dirname, '..', '.next');

// Remove lock file if it exists
if (fs.existsSync(lockPath)) {
  console.log('🧹 Removing stale lock file...');
  try {
    fs.unlinkSync(lockPath);
    console.log('✓ Lock file removed');
  } catch {
    // If we can't remove the lock, try removing the whole .next/dev folder
    console.log('⚠ Could not remove lock file, trying to remove .next/dev folder...');
    try {
      fs.rmSync(path.join(nextDir, 'dev'), { recursive: true, force: true });
      console.log('✓ Removed .next/dev folder');
    } catch {
      console.log('⚠ Could not clean up. You may need to run: npm run dev:force');
    }
  }
}

console.log('🚀 Starting Next.js dev server...');
