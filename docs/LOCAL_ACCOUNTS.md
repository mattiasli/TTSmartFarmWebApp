# User IDs and passwords

An admin can open **Settings → Add a user**, choose a user ID and password, and
select **Viewer**, **Operator** or **Admin**. No GitHub account or external identity
provider is needed for that user. Existing GitHub sign-in remains available.

Production password sign-in is available at `https://ttsmartfarm.mattias.li/login`
and `https://smartfarm-live.vercel.app/login`. Both exact origins are configured in
Railway's `ALLOWED_BROWSER_ORIGINS` and checked against `browserOrigins` in
`tools/deploy/production.json` during releases. DNS routing alone does not authorize
an origin. Unknown, missing and `null` origins remain rejected.

GitHub sign-in starts on `smartfarm-live.vercel.app`, which owns the registered
OAuth callback and binding cookie. The session DTO supplies this absolute
`githubLoginUrl`; password sign-in and its host-only session remain on the domain
where the user signed in. `PUBLIC_APP_ORIGIN` stays on the registered GitHub origin.

User IDs are case-insensitive, 3–64 characters, beginning with a letter or number;
subsequent characters may include dots, underscores and hyphens. Passwords are
15–128 characters, with no mandatory character composition. Give initial or reset
passwords to the intended user privately. The sign-in page accepts these credentials.
There is no public registration or email recovery service. Any admin can reset a
local user's password from Settings.

Viewers can read the farm. Operators can use manual controls and automations.
Admins can also create users, change roles, reset local passwords and remove
access. Role changes, password resets and removal revoke sessions and disconnect
active sockets. The last active administrator cannot be demoted or removed.
Removing local access frees the login ID when the account has no other farm
membership; historical user records remain. GitHub and password identities are
separate even when their displayed names match.
The configured bootstrap GitHub admin is seeded only for a new farm; restarting
an existing farm does not recreate removed access.

## Storage and session protection

Migration `004_local_accounts.sql` makes GitHub identity optional and adds
`local_accounts` and `password_login_limits`. Passwords are never stored in plain
text or returned by account-list endpoints. Node's asynchronous scrypt uses a
random 16-byte salt, N=32768, r=8, p=3 (32 MiB), with a maximum of two concurrent hashes.
This matches an [OWASP scrypt profile](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).

Password login requires an allowed Origin. Admin mutations also require the
existing authenticated admin role and CSRF token. Password sessions use the same
Secure/HttpOnly/SameSite cookie policy as OAuth, a 12-hour absolute expiry and a
2-hour idle expiry. Production uses the host-only `__Host-smartfarm_session` cookie.
Resetting a password locks its credential row through session invalidation;
login rechecks and locks the credential/membership before issuing a session.

Attempts are limited in PostgreSQL over 15-minute windows: 10 per normalized
user ID, 30 per server-observed IP and 100 globally. The IP is not taken from an
untrusted forwarded header; a shared reverse-proxy IP may therefore share that
limit. Limits persist across restarts. Expired counters are deleted on subsequent
login attempts; the global limit bounds counter growth. Unknown IDs and wrong
passwords have the same message and perform password hashing. No farm commands
are part of authentication or account administration.

## API

| Method | Path | Body / purpose |
|---|---|---|
| POST | `/api/v1/auth/password/login` | `{ userId, password }`; returns session DTO and cookie |
| POST | `/api/v1/farms/:farmId/accounts` | Admin creates `{ userId, password, role }` |
| PUT | `/api/v1/farms/:farmId/accounts/:userId` | Admin sets `{ role }`; path ID is the member's UUID |
| POST | `/api/v1/farms/:farmId/accounts/:userId/password` | Admin resets `{ password }` for a local member |
| DELETE | `/api/v1/farms/:farmId/accounts/:userId` | Admin removes access |

The member list adds `userId` (UUID), `loginType` and nullable `githubId`.
`passwordLoginEnabled` in the session DTO controls the login form. The existing
loopback-only `/api/v1/local/login` development shortcut is separate from real
password authentication and stays unavailable in production.

An application rollback to a pre-local-account frontend will hide password login
and management. Preserve GitHub admin access for that rollback path. The migration
does not remove existing GitHub accounts or change farm settings/control flags.
