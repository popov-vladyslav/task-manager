// requireAuth resolves the bearer token to a user and stashes the id here, so
// routes can pass an explicit owner into the services instead of each service
// re-deriving it. Optional on the type because it is only set on authenticated
// routes; use requireUserId() in middleware/auth to read it safely.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      /** Set by the /mcp auth middleware: the account a tool call acts as. */
      mcpUserId?: string;
    }
  }
}

export {};
