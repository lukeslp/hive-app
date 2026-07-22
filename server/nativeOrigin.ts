import type { NextFunction, Request, Response } from "express";

const MAC_APP_ORIGIN = "ideatiles://app";

/** Allow the dedicated Mac web bundle to use hosted credentialed APIs. */
export function nativeOriginMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const origin = req.headers.origin;
  if (origin !== MAC_APP_ORIGIN || !req.path.startsWith("/api")) {
    next();
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", MAC_APP_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,X-Requested-With"
  );
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}
