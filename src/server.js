import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { getSession } from './db/index.js';
import { homeRouter } from './routes/home.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { adminRouter } from './routes/admin.js';
import { apiRouter } from './routes/api.js';
import { renderErrorView } from './ui/errorView.js';
import { flashMiddleware } from './middleware/flash.js';

/**
 * Creates and configures the Express application with modular routers and error handlers.
 */
export function createServer() {
  const app = express();

  // Core Middlewares
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser(config.sessionSecret));
  app.use(flashMiddleware);

  // Branded favicon handler (prevents 404s for browsers requesting /favicon.ico or /favicon.svg)
  const faviconSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">' +
      '<rect width="32" height="32" rx="8" fill="#0d0d11"/>' +
      '<rect x="1" y="1" width="30" height="30" rx="7" fill="none" stroke="#d4af37" stroke-opacity="0.3" stroke-width="1"/>' +
      '<path d="M7 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H14l-4 4v-4H9a2 2 0 0 1-2-2V8z" fill="#d4af37"/>' +
      '<circle cx="12" cy="13" r="1.5" fill="#0d0d11"/>' +
      '<circle cx="16" cy="13" r="1.5" fill="#0d0d11"/>' +
      '<circle cx="20" cy="13" r="1.5" fill="#0d0d11"/>' +
    '</svg>'
  );

  app.get(['/favicon.ico', '/favicon.svg'], (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(faviconSvg);
  });

  // Branded default avatar handler (prevents 404s for profiles without avatars or broken CDN URLs)
  const defaultAvatarSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">' +
      '<rect width="100" height="100" rx="50" fill="#141312"/>' +
      '<circle cx="50" cy="50" r="48" fill="none" stroke="#d4af37" stroke-opacity="0.3" stroke-width="2"/>' +
      '<circle cx="50" cy="38" r="18" fill="#d4af37" fill-opacity="0.85"/>' +
      '<path d="M22 84c0-15.5 12.5-28 28-28s28 12.5 28 28" fill="#d4af37" fill-opacity="0.85"/>' +
    '</svg>'
  );

  app.get(['/default-avatar.svg', '/avatar-placeholder.svg'], (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(defaultAvatarSvg);
  });

  // Mount Modular Routers
  app.use('/', homeRouter);
  app.use('/auth', authRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/admin', adminRouter);
  app.use('/api', apiRouter);

  // 404 Catch-All Not Found Handler
  app.use((req, res) => {
    const sessionToken = req.cookies?.session_token;
    const user = getSession(sessionToken);

    res.status(404).send(
      renderErrorView({
        statusCode: 404,
        title: 'Page Not Found',
        message: 'The page or resource you are looking for does not exist or has been moved.',
        backUrl: '/',
        backLabel: 'Return to Homepage',
        user,
      })
    );
  });

  // 500 Global Unhandled Error Handler
  app.use((err, req, res, next) => {
    console.error('[Server Error]', err);
    const sessionToken = req.cookies?.session_token;
    const user = getSession(sessionToken);

    res.status(500).send(
      renderErrorView({
        statusCode: 500,
        title: 'Internal Server Error',
        message: 'An unexpected issue occurred while processing your request. Please try again shortly.',
        backUrl: '/',
        backLabel: 'Return to Homepage',
        user,
      })
    );
  });

  return app;
}
