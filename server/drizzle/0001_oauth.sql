-- OAuth dynamic client registrations (for the claude.ai MCP connector).
-- Access/refresh tokens are stateless JWTs; auth codes are in-memory (short-lived).
CREATE TABLE oauth_clients (
  client_id  text PRIMARY KEY,
  data       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
