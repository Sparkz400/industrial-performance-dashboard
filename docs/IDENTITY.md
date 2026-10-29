# Single sign-on and service accounts (E02)

Local accounts keep working as before. Single sign-on (OIDC) and service accounts are
additions. Single sign-on is off until `OIDC_ISSUER` is set.

## Single sign-on

The login page offers **Sign in with** *OIDC_DISPLAY_NAME*. Sign-in uses the
authorization code flow with PKCE. State and nonce are kept in the browser's session.
[openid-client](https://github.com/panva/openid-client) checks the issuer, audience,
signature, expiry and nonce of the ID token.

| Setting | Meaning |
| --- | --- |
| `OIDC_ISSUER` | HTTPS issuer identifier. Discovery must report the same issuer. |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | A confidential client. The secret is sent with HTTP Basic authentication. |
| `OIDC_REDIRECT_URI` | `https://<dashboard>/api/v1/auth/oidc/callback`, registered at the provider |
| `OIDC_CA_FILE` | Optional. Trust only this CA for the provider instead of the system store. |
| `OIDC_SCOPES`, `OIDC_GROUPS_CLAIM` | Default `openid profile email groups`; the groups are read from `groups`. |
| `OIDC_MAX_SESSION_HOURS` | Default 8. After this age the browser must sign in at the provider again. |
| `LOCAL_RECOVERY_ACCOUNTS` | Comma-separated local accounts that may still use a password. |

A wrong issuer, an untrusted provider certificate or an unreachable provider stops
sign-in with 502 before any redirect. Multi-factor authentication follows the provider's
policy; the dashboard does not check `acr` or `amr`.

### Groups, roles and sites

Administrators map provider groups under **Settings → People & Access → Single sign-on
group mappings**. Each mapping grants a role (wallboard, viewer, operator or supervisor)
and optionally sites.

- At each sign-in, the highest mapped role applies.
- The account's site memberships are replaced by the mapped sites. Machine grants
  remain manual.
- A group never grants administrator. An administrator may promote an account; the
  promotion is kept while any mapped group remains.
- An account without a mapped group is refused.
- A first sign-in never takes over an existing account with the same name or email.
  An administrator must rename or remove that account first.

### Sessions

- A role change ends the account's other sessions.
- Deactivating the account ends all its sessions, as for local accounts.
- A group removed at the provider takes effect at the next sign-in, at the latest after
  `OIDC_MAX_SESSION_HOURS`, or at once through back-channel logout.
- **Back-channel logout:** register `https://<dashboard>/api/v1/auth/oidc/backchannel-logout`.
  The logout token is checked for signature, issuer, audience, an age of at most
  5 minutes, the logout event and the absence of a nonce. It ends the named provider
  session, or all of the subject's sessions. Invalid tokens end nothing and are
  answered with 400. The provider must be able to reach the dashboard; in OT networks
  this is often blocked, and the session age limit then applies.
- Signing out of the dashboard does not sign the browser out of the provider.

### Recovery

With single sign-on configured, password sign-in is refused, except for accounts named
in `LOCAL_RECOVERY_ACCOUNTS` (none by default). Each recovery sign-in is logged as a
warning and audited as `auth.recovery_login`. There is no hidden bypass. The read-only
recovery preview after a restore uses local sign-in only.

## Service accounts

Under **Settings → People & Access → Service accounts**, an administrator creates an
account for an integration:

- **Role:** viewer, or supervisor for the work-order completion endpoint.
- **Machines:** its machine grants.
- **Token:** valid for 1–365 days, shown once and stored only as a SHA-256 hash.

A token is sent as `Authorization: Bearer pdsa_…` and:

- reads only the [integration API's read endpoints](INTEGRATION_API.md), with GET and
  with the account's grants;
- never writes, creates no session and needs no CSRF token;
- is refused with 401 when unknown, expired or revoked, or when the account is
  deactivated.

A service account cannot sign in with a password. New tokens (rotation) and
revocations are audited.

## Evidence and limits

`scripts/test-oidc.mjs` runs an owned [oidc-provider](https://github.com/panva/node-oidc-provider)
over HTTPS with a pinned CA. It covers:

- browser sign-in through the provider's own login and consent pages;
- group-to-role and site mapping, and refusal without a mapped group;
- no takeover of an existing local name;
- role change ending older sessions, and promotion kept while a group remains;
- back-channel logout, and seven rejected logout tokens;
- the session age limit;
- a code issued to another client;
- a wrong issuer and a foreign CA;
- the recovery-account rule;
- service-token scope, refusal, rotation, revocation and expiry, and their administration
  in the browser.

Not covered: real providers (Microsoft Entra ID, AD FS, Keycloak) and their group-claim
limits. For example, Entra ID omits groups above a limit and sends an overage claim,
which the dashboard does not resolve.
