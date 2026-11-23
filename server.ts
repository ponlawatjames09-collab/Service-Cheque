import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import chequesHandler from './api/cheques.ts';
import healthHandler from './api/health.ts';
import importSheetHandler from './api/import-sheet.ts';
import receivablesHandler from './api/receivables.ts';
import serviceBillingHandler from './api/service-billing.ts';
import telegramNotifyHandler from './api/telegram/notify.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '512kb' }));

  app.all('/api/health', (req, res) => {
    healthHandler(req, res);
  });

  app.all('/api/cheques', (req, res) => {
    void chequesHandler(req, res);
  });

  app.all('/api/import-sheet', (req, res) => {
    void importSheetHandler(req, res);
  });

  app.all('/api/receivables', (req, res) => {
    void receivablesHandler(req, res);
  });

  app.all('/api/service-billing', (req, res) => {
    void serviceBillingHandler(req, res);
  });

  app.all('/api/telegram/notify', (req, res) => {
    void telegramNotifyHandler(req, res);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
