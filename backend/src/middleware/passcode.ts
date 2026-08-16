import type { RequestHandler } from 'express';

/** Not real auth — a crawler/bot filter. See docs/adr/0005-backend-responsibilities.md. */
export function passcodeMiddleware(expectedPasscode: string): RequestHandler {
  return (req, res, next) => {
    const provided = req.body?.passcode;
    if (provided !== expectedPasscode) {
      res.status(401).json({ error: 'invalid passcode' });
      return;
    }
    next();
  };
}
