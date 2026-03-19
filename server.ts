import express, { Request, Response, NextFunction } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

// Initialize Database
const db = new Database('microgpt.db');
db.pragma('journal_mode = WAL');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this';

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    password TEXT,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT,
    preview TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT,
    role TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(chat_id) REFERENCES chats(id)
  );
`);

// Authentication Middleware
const authenticateToken = (req: any, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
};

async function startServer() {
  const app = express();
  const PORT = 3000;
  const PYTHON_PORT = 3001;

  // Security Headers
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for development with Vite
    crossOriginEmbedderPolicy: false
  }));

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
  });
  app.use('/api/', limiter);

  app.use(express.json());

  // 1. Start Python Backend on 3001
  console.log('Starting Python (FastAPI) backend on port 3001...');
  const python = spawn('python3', ['main.py'], {
    stdio: 'inherit',
    env: { ...process.env, PYTHONUNBUFFERED: '1', FLASK_PORT: PYTHON_PORT.toString() }
  });

  python.on('error', (err) => {
    console.error('Failed to start Python backend:', err);
  });

  // 2. Auth Routes
  const signupSchema = z.object({
    email: z.string().email(),
    name: z.string().min(2),
    password: z.string().min(8)
  });

  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { email, name, password } = signupSchema.parse(req.body);
      const id = Math.random().toString(36).substring(7);
      const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`;
      
      const hashedPassword = await bcrypt.hash(password, 10);
      
      db.prepare('INSERT INTO users (id, email, name, password, avatar) VALUES (?, ?, ?, ?, ?)').run(id, email, name, hashedPassword, avatar);
      
      const token = jwt.sign({ id, email }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ user: { id, email, name, avatar }, token });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: e.issues[0].message });
      }
      res.status(400).json({ error: 'Email already exists or invalid data' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    
    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ 
        user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
        token 
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  // OAuth Endpoints (Simplified for demo, in production use proper token exchange)
  app.get('/api/auth/:provider/url', (req, res) => {
    const { provider } = req.params;
    const redirectUri = `${process.env.APP_URL || `http://localhost:${PORT}`}/auth/callback`;
    let authUrl = '';

    if (provider === 'google') {
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || 'dummy_google_id',
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state: 'google'
      });
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    } else if (provider === 'facebook') {
      const params = new URLSearchParams({
        client_id: process.env.FACEBOOK_CLIENT_ID || 'dummy_facebook_id',
        redirect_uri: redirectUri,
        scope: 'email,public_profile',
        state: 'facebook'
      });
      authUrl = `https://www.facebook.com/v12.0/dialog/oauth?${params}`;
    } else if (provider === 'linkedin') {
      const params = new URLSearchParams({
        client_id: process.env.LINKEDIN_CLIENT_ID || 'dummy_linkedin_id',
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'r_liteprofile r_emailaddress',
        state: 'linkedin'
      });
      authUrl = `https://www.linkedin.com/oauth/v2/authorization?${params}`;
    }

    res.json({ url: authUrl });
  });

  app.get('/auth/callback', (req, res) => {
    const { code, state } = req.query;
    const email = `user_${state}@example.com`;
    const name = `${state?.toString().charAt(0).toUpperCase()}${state?.toString().slice(1)} User`;
    const id = Math.random().toString(36).substring(7);
    const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`;

    try {
      const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
      let user = existing;
      if (!existing) {
        db.prepare('INSERT INTO users (id, email, name, avatar) VALUES (?, ?, ?, ?)').run(id, email, name, avatar);
        user = { id, email, name, avatar };
      }
      
      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  user: ${JSON.stringify(user)},
                  token: '${token}'
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (e) {
      res.status(500).send('Auth failed');
    }
  });

  // 3. Chat Routes (Protected)
  app.get('/api/chats', authenticateToken, (req: any, res) => {
    console.log(`[AUDIT] User ${req.user.id} requested chat history`);
    const chats = db.prepare('SELECT * FROM chats WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json(chats);
  });

  app.post('/api/chats', authenticateToken, (req: any, res) => {
    const { title, preview } = req.body;
    console.log(`[AUDIT] User ${req.user.id} creating new chat: ${title}`);
    const id = Math.random().toString(36).substring(7);
    db.prepare('INSERT INTO chats (id, user_id, title, preview) VALUES (?, ?, ?, ?)').run(id, req.user.id, title, preview);
    res.json({ id, title, preview });
  });

  app.get('/api/chats/:id/messages', authenticateToken, (req: any, res) => {
    console.log(`[AUDIT] User ${req.user.id} fetching messages for chat ${req.params.id}`);
    const messages = db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC').all(req.params.id);
    res.json(messages);
  });

  app.post('/api/chats/:id/messages', authenticateToken, (req: any, res) => {
    const { role, content } = req.body;
    console.log(`[AUDIT] User ${req.user.id} sent message in chat ${req.params.id} as ${role}`);
    const id = Math.random().toString(36).substring(7);
    db.prepare('INSERT INTO messages (id, chat_id, role, content) VALUES (?, ?, ?, ?)').run(id, req.params.id, role, content);
    res.json({ id, role, content });
  });

  // 4. Proxy API requests to Python (for AI calls)
  app.use('/api', createProxyMiddleware({
    target: `http://localhost:${PYTHON_PORT}`,
    changeOrigin: true,
  }));

  // 5. Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    console.log('Starting Vite in middleware mode...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express server running on http://localhost:${PORT}`);
  });
}

startServer();
