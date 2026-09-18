import { createHash, randomBytes } from 'node:crypto';

export function randomUrlToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function githubAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}) {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope', '');
  return url.toString();
}

export type GitHubIdentity = {
  id: string;
  login: string;
  name: string | null;
};

export async function exchangeGithubCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  verifier: string;
  fetchImpl?: typeof fetch;
}): Promise<GitHubIdentity> {
  const fetchFn = input.fetchImpl ?? fetch;
  const tokenResponse = await fetchFn('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
    }),
  });
  const tokenBody = (await tokenResponse.json()) as { access_token?: string; error?: string };
  const accessToken = tokenBody.access_token;
  if (!accessToken) {
    throw new Error(tokenBody.error || 'GitHub token exchange failed.');
  }
  try {
    const userResponse = await fetchFn('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'smartfarm-remote-web',
      },
    });
    if (!userResponse.ok) throw new Error('GitHub identity lookup failed.');
    const user = (await userResponse.json()) as { id?: number; login?: string; name?: string | null };
    if (!user.id || !user.login) throw new Error('GitHub identity lookup failed.');
    return { id: String(user.id), login: user.login, name: user.name ?? null };
  } finally {
    // Access tokens are not retained after identity lookup.
  }
}
