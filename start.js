import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const distPath = path.join(process.cwd(), 'dist');

async function start() {
  console.log('--- MicroGPT Startup Sequence ---');

  // 0. Verify Python
  console.log('Step 0: Verifying Python installation...');
  try {
    const version = execSync('python3 --version').toString().trim();
    console.log(`Using ${version}`);
  } catch (e) {
    console.error('Error: python3 command not found. Trying "python"...');
    try {
      const version = execSync('python --version').toString().trim();
      console.log(`Using ${version}`);
      // If python works but python3 doesn't, we should use python
      process.env.PYTHON_CMD = 'python';
    } catch (e2) {
      console.error('Fatal Error: Neither python3 nor python found.');
      process.exit(1);
    }
  }
  const pythonCmd = process.env.PYTHON_CMD || 'python3';

  // 1. Install Python dependencies
  console.log('Step 1: Installing Python dependencies...');
  try {
    execSync(`${pythonCmd} -m pip install flask flask-cors openai python-dotenv`, { stdio: 'inherit' });
    console.log('Python dependencies installed.');
  } catch (e) {
    console.error('Warning: Failed to install Python dependencies via pip.');
  }

  // 2. Build Frontend if missing
  if (!fs.existsSync(distPath) || !fs.existsSync(path.join(distPath, 'index.html'))) {
    console.log('Step 2: Building frontend (dist folder missing or incomplete)...');
    try {
      execSync('npm run build', { stdio: 'inherit' });
      console.log('Frontend built successfully.');
    } catch (e) {
      console.error('Error: Failed to build frontend:', e);
    }
  } else {
    console.log('Step 2: Frontend already built. Skipping build.');
  }

  // 3. Start Python Backend
  console.log(`Step 3: Starting Python backend (${pythonCmd})...`);
  const python = spawn(pythonCmd, ['main.py'], {
    stdio: 'inherit',
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  python.on('error', (err) => {
    console.error('Failed to start Python process:', err);
  });

  python.on('close', (code) => {
    console.log(`Python process exited with code ${code}`);
    process.exit(code || 1);
  });
}

start().catch(err => {
  console.error('Startup failed:', err);
  process.exit(1);
});
