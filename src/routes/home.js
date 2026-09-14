import { Router } from 'express';
import { getSession } from '../db/index.js';
import { renderHomeView } from '../ui/homeView.js';

export const homeRouter = Router();

homeRouter.get('/', (req, res) => {
  const sessionToken = req.cookies?.session_token;
  const user = getSession(sessionToken);
  const success = req.flash?.success;
  const error = req.flash?.error;

  const html = renderHomeView({ user, error, success });
  res.send(html);
});
