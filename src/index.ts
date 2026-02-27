import express, { Request, Response, NextFunction } from 'express';
import mermaidRoutes, { mermaidErrorHandler } from './routes/mermaid';
import compatibleRoutes, { compatibleErrorHandler } from './routes/compatible';
import { browserPool } from './services/browser-pool';

const app = express();
const port = process.env.PORT || 3000;
const useBrowserPool = process.env.USE_BROWSER_POOL === 'true';

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  const status: Record<string, unknown> = { status: 'ok' };
  
  // 如果启用了 Browser Pool，返回池状态
  if (useBrowserPool) {
    status.browserPool = browserPool.getStatus();
  }
  
  res.json(status);
});

// mermaid.ink compatible routes (must be before API routes)
// GET /svg/:code - Returns SVG
// GET /img/:code - Returns PNG/JPEG
app.use('/', compatibleRoutes);
app.use('/', compatibleErrorHandler);

// API routes (POST-based)
app.use('/api/mermaid', mermaidRoutes);

// Mermaid-specific error handler
app.use('/api/mermaid', mermaidErrorHandler);

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong' 
      : err.message,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Mermaid Render API server running on port ${port}`);
  console.log(`   Health check: http://localhost:${port}/health`);
  console.log(`   Browser Pool: ${useBrowserPool ? 'ENABLED' : 'DISABLED'}`);
  console.log('');
  console.log('   📌 mermaid.ink compatible API:');
  console.log(`   GET http://localhost:${port}/svg/{base64_encoded_code}`);
  console.log(`   GET http://localhost:${port}/img/{base64_encoded_code}?type=png`);
  console.log('');
  console.log('   📌 POST API:');
  console.log(`   POST http://localhost:${port}/api/mermaid/generate`);
});

export default app;
