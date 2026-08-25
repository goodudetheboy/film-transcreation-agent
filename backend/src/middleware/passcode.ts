import type { RequestHandler } from 'express';

/** Not real auth — a crawler/bot filter. See docs/adr/0005-backend-responsibilities.md. */
export function passcodeMiddleware(expectedPasscode: string): RequestHandler {
  return (req, res, next) => {
    // GET requests conventionally carry no body, so accept the passcode as a query
    // param for those (POST/streaming requests keep sending it in the body).
    const provided = req.body?.passcode ?? req.query?.passcode;
    if (provided !== expectedPasscode) {
      res.status(401).json({ error: 'invalid passcode' });
      return;
    }
    next();
  };
}
