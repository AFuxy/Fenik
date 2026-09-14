import { Router } from 'express';
import { getBotAccount, getAllChannels, getSession } from '../db/index.js';
import { renderAdminView } from '../ui/adminView.js';
import { renderErrorView } from '../ui/errorView.js';
import { config, isAdmin } from '../config.js';

export const adminRouter = Router();

function requireAdmin(req, res, next) {
  const sessionToken = req.cookies?.session_token;
  const session = getSession(sessionToken);

  if (!session) {
    res.setFlash('error', 'Administrator login required');
    return res.redirect('/');
  }

  if (!isAdmin(session)) {
    return res.status(403).send(
      renderErrorView({
        statusCode: 403,
        title: 'Access Denied',
        message: 'You do not have permission to access Host Control. This section is restricted to authorized platform administrators.',
        backUrl: '/dashboard',
        backLabel: 'Return to Dashboard',
        user: session,
      })
    );
  }

  req.user = session;
  next();
}

adminRouter.get('/', requireAdmin, (req, res) => {
  const bot = getBotAccount();
  const channels = getAllChannels();
  const success = req.flash?.success;
  const error = req.flash?.error;

  const html = renderAdminView({
    bot,
    channels,
    user: req.user,
    success,
    error,
  });

  res.send(html);
});
