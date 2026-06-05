import express, { type Express, type Request, type Response } from 'express';
import { env } from '../../config/env';
import type { Route, HttpRequest } from './types';
import type { AuthService } from '../../services/auth.service';
import { resolveContext } from '../middleware/auth.middleware';
import { sendError } from '../middleware/error.middleware';
import { UnauthorizedError } from '../../core/errors/app-error';
import { createLogger } from '../../utils/logger';

const logger = createLogger('http');

export function createApp(routes: Route[], authService: AuthService): Express {
  const app = express();

  // CORS
  app.use((req, res, next) => {
    const origin = req.headers['origin'];
    if (!origin || env.CORS_ORIGINS.includes(origin) || env.CORS_ORIGINS.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });

  // Static public files
  app.use(express.static('public'));

  // Register routes
  for (const route of routes) {
    const expressPath = route.path.replace(/:([a-zA-Z]+)/g, ':$1');
    const method = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete';

    app[method](expressPath, async (req: Request, res: Response) => {
      try {
        const ctx = await resolveContext(req.headers['authorization'], authService, route.auth);
        if (route.auth && !ctx) {
          throw new UnauthorizedError();
        }

        const httpReq: HttpRequest = {
          ctx,
          params: req.params as Record<string, string>,
          query: req.query as Record<string, string | undefined>,
          body: req.body,
        };

        const result = await route.handler(httpReq);
        res.json(result);
      } catch (err) {
        sendError(res, err);
      }
    });
  }

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Endpoint not found' });
  });

  return app;
}
