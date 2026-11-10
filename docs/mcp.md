# Claude MCP server (v1, read-only)

Lets a Claude client read one user's influencers, generated images and post
status. It cannot create, spend credits, schedule or publish.

## Run it

```bash
pnpm --silent mcp   # stdio. --silent keeps pnpm's banner off stdout, which carries the protocol
```

Identity, one of:

| Variable                                     | Use                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `THEPLUS_MCP_ACCESS_TOKEN`                   | A signed-in user's Supabase access token. Expires after about an hour; restart with a fresh one. |
| `THEPLUS_MCP_EMAIL` + `THEPLUS_MCP_PASSWORD` | Signs in once at startup. The session isn't refreshed, so restart after about an hour.           |

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are also needed.
It deliberately does **not** load `.env.local`, because that file holds
`SUPABASE_SERVICE_ROLE_KEY`. Pass only these variables through the client config.

Claude Code (local scope, not committed):

```bash
claude mcp add theplus \
  -e NEXT_PUBLIC_SUPABASE_URL=... -e NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  -e THEPLUS_MCP_EMAIL=... -e THEPLUS_MCP_PASSWORD=... \
  -- pnpm --silent --dir /path/to/theplus-ai-influencer mcp
```

Without a valid identity the server still starts and lists its tools, but every
call returns `UNAUTHENTICATED`. The reason goes to stderr.

## Authority

- Requests act as the user behind the token. Tenant and user are never taken
  from tool arguments (inputs are strict: an unknown field such as
  `workspace_id` is rejected).
- Postgres RLS is the enforcement point. Each query also filters on the
  caller's `workspace_id` as a second layer.
- A record in another workspace and a missing record return the same
  `RESOURCE_NOT_FOUND`, so an id never confirms that a record exists elsewhere.
- Audit: one JSON line per call on stderr (`request_id`, tool, user, outcome,
  error code). It isn't durable yet.

## Tools

Every call that passes argument validation returns
`{ success, data | error, meta: { request_id, timestamp } }`, with `isError: true`
on errors. Error codes: `UNAUTHENTICATED`, `RESOURCE_NOT_FOUND`, `INTERNAL_ERROR`.
Database detail is never returned.

Invalid arguments are rejected by the MCP SDK before the tool runs. The result
has `isError: true` and a text message naming the field (for example,
`Unrecognized key: "workspace_id"`), but no envelope or request id, and no audit line.

| Tool                    | Input                                 | Returns                                                                                   |
| ----------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `list_influencers`      | `cursor?`, `limit?` (1–50)            | influencer summaries, `next_cursor`                                                       |
| `get_influencer`        | `influencer_id` (uuid)                | profile: gender, age range, hair, body type, skin tone, vibe, portrait and full-body URLs |
| `list_generated_assets` | `influencer_id?`, `cursor?`, `limit?` | images (pictures and edits) with prompt, source asset, ratio, credits spent               |
| `get_post_status`       | `post_id` (uuid)                      | status (`draft` / `scheduled` / `published`), platforms, scheduled time, review state     |

`get_post_status` reports a single status for the whole post. The app does not
store a status for each platform.

## Not in v1, and what each needs

| Proposed tool                                                           | Blocked on                                                                                                                                                                 |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_influencer`                                                     | Paid Luma renders inside a server action. Needs a durable idempotency store (a migration) and the existing charge path reused, not duplicated.                             |
| `generate_image`                                                        | Charge and refund live in `createAction`, which is synchronous. Needs the idempotency store, and either the job queue or a shared charge path.                             |
| `get_generation_status`                                                 | Image renders have no job record. A creation row exists only after success.                                                                                                |
| `generate_slideshow`, `generate_motion_video`, `generate_talking_video` | The app does not generate these on `/create`. Video comes in the Video slice. Talking video and slideshows don't exist.                                                    |
| `create_post_draft`                                                     | Needs the idempotency store.                                                                                                                                               |
| `schedule_post`                                                         | Needs an approval record bound to user, draft revision, accounts, action and time. `review_decisions` doesn't bind those. It must also pass through the brand-safety gate. |
| Remote (Streamable HTTP)                                                | Needs OAuth for MCP clients. Not exposed.                                                                                                                                  |

## Tests

`src/mcp/__tests__/server.test.ts`. It uses a FAKE database that applies the
adapter's filters. It proves the adapter's scoping, schemas, errors and audit,
not RLS. Its last test spawns the real stdio process through the official SDK
client. Cross-tenant checks against real Postgres RLS need a database with two
users and have not been run.
