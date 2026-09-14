import { renderLayout } from './layout.js';

/**
 * Renders a bespoke, production error screen in the Neo Kinpaku design language.
 */
export function renderErrorView({
  statusCode = 404,
  title = 'Page Not Found',
  message = null,
  backUrl = '/',
  backLabel = 'Return to Homepage',
  user = null,
}) {
  const defaultMessages = {
    400: 'The request could not be understood or was missing required parameters.',
    403: 'You do not have permission to access this area. This section is restricted.',
    404: 'The page or resource you requested does not exist, has been moved, or is temporarily unavailable.',
    500: 'An unexpected issue occurred while processing your request. Please try again shortly.',
  };

  const statusLabel = {
    400: 'BAD_REQUEST',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    500: 'INTERNAL_ERROR',
  }[statusCode] || 'ERROR';

  const bodyMessage = message || defaultMessages[statusCode] || 'An error occurred while handling your request.';

  const content = `
    <main class="ks-container" style="display: flex; align-items: center; justify-content: center; min-height: 65vh; padding: 48px 24px;">
      <section class="ks-card" style="max-width: 580px; width: 100%; padding: 48px 36px; text-align: center; border-color: var(--ks-rule);">
        <div style="display: inline-flex; align-items: center; gap: 8px; margin-bottom: 16px;">
          <span class="ks-tag ${statusCode >= 500 ? '' : statusCode === 403 ? '' : 'ks-tag-gold'}" style="font-family: var(--ks-mono); font-size: 0.78rem; padding: 3px 9px; letter-spacing: 0.08em; ${statusCode === 403 ? 'color: var(--ks-vermilion); border-color: oklch(58% 0.15 35 / 0.35); background: var(--ks-vermilion-soft);' : ''}">
            HTTP ${statusCode} · ${statusLabel}
          </span>
        </div>

        <h1 style="font-family: var(--ks-font-display); font-size: clamp(2.4rem, 5vw, 3.4rem); font-weight: 300; line-height: 1.05; color: var(--ks-champagne); margin-bottom: 16px;">
          ${title}
        </h1>

        <p style="color: var(--ks-text-muted); font-size: 1rem; line-height: 1.6; max-width: 52ch; margin: 0 auto 36px;">
          ${bodyMessage}
        </p>

        <div style="display: flex; align-items: center; justify-content: center; gap: 14px; flex-wrap: wrap;">
          <a href="${backUrl}" class="ks-button ks-button-primary">
            <span>${backLabel}</span>
            <span class="ks-button-arrow" aria-hidden="true">
              <svg viewBox="0 0 14 8" fill="none"><path d="M1 4h12m0 0L9.5 1M13 4L9.5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
          </a>

          ${user ? `
            <a href="/dashboard" class="ks-button ks-button-secondary">
              <span>Open Dashboard</span>
            </a>
          ` : `
            <a href="/auth/login" class="ks-button ks-button-secondary">
              <span>Sign In with Twitch</span>
            </a>
          `}
        </div>
      </section>
    </main>
  `;

  return renderLayout({
    title: `${statusCode} ${title}`,
    content,
    user,
  });
}
