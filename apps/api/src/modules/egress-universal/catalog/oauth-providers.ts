// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/catalog/oauth-providers.ts
// ============================================================================
// OAuth provider profiles for the destinations that use the browser
// "tap to connect" flow. Forge Nova owns the developer app for each of
// these providers; the user supplies nothing but their provider login.
// client_id / client_secret live in server environment variables, NEVER
// in this file or in any client-visible payload.

export interface OAuthProviderProfile {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  usePkce: boolean;
  secretInBody: boolean;
  envKey: string; // e.g. OAUTH_FACEBOOK_CLIENT_ID / _CLIENT_SECRET
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderProfile> = {
  facebook: { authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth', tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token', scopes: ['public_profile', 'pages_show_list', 'pages_manage_posts'], usePkce: false, secretInBody: true, envKey: 'FACEBOOK' },
  instagram: { authorizeUrl: 'https://api.instagram.com/oauth/authorize', tokenUrl: 'https://api.instagram.com/oauth/access_token', scopes: ['instagram_basic', 'pages_show_list'], usePkce: false, secretInBody: true, envKey: 'INSTAGRAM' },
  threads: { authorizeUrl: 'https://threads.net/oauth/authorize', tokenUrl: 'https://graph.threads.net/oauth/access_token', scopes: ['threads_basic', 'threads_content_publish'], usePkce: false, secretInBody: true, envKey: 'THREADS' },
  linkedin: { authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization', tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken', scopes: ['openid', 'profile', 'w_member_social'], usePkce: false, secretInBody: true, envKey: 'LINKEDIN' },
  tiktok: { authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/', tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/', scopes: ['user.info.basic'], usePkce: true, secretInBody: false, envKey: 'TIKTOK' },
  'x-twitter': { authorizeUrl: 'https://twitter.com/i/oauth2/authorize', tokenUrl: 'https://api.twitter.com/2/oauth2/token', scopes: ['tweet.read', 'users.read', 'offline.access'], usePkce: true, secretInBody: false, envKey: 'X_TWITTER' },
  spotify: { authorizeUrl: 'https://accounts.spotify.com/authorize', tokenUrl: 'https://accounts.spotify.com/api/token', scopes: ['user-read-email', 'playlist-modify-public'], usePkce: true, secretInBody: false, envKey: 'SPOTIFY' },
  'google-drive': { authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scopes: ['https://www.googleapis.com/auth/drive.file'], usePkce: true, secretInBody: true, envKey: 'GOOGLE_DRIVE' },
  'google-calendar': { authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scopes: ['https://www.googleapis.com/auth/calendar'], usePkce: true, secretInBody: true, envKey: 'GOOGLE_CALENDAR' },
  'google-sheets': { authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scopes: ['https://www.googleapis.com/auth/spreadsheets'], usePkce: true, secretInBody: true, envKey: 'GOOGLE_SHEETS' },
  'google-docs': { authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scopes: ['https://www.googleapis.com/auth/documents'], usePkce: true, secretInBody: true, envKey: 'GOOGLE_DOCS' },
  'google-fit': { authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scopes: ['https://www.googleapis.com/auth/fitness.activity.read'], usePkce: true, secretInBody: true, envKey: 'GOOGLE_FIT' },
  youtube: { authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scopes: ['https://www.googleapis.com/auth/youtube.upload'], usePkce: true, secretInBody: true, envKey: 'YOUTUBE' },
  github: { authorizeUrl: 'https://github.com/login/oauth/authorize', tokenUrl: 'https://github.com/login/oauth/access_token', scopes: ['repo', 'read:org'], usePkce: false, secretInBody: true, envKey: 'GITHUB' },
  hubspot: { authorizeUrl: 'https://app.hubspot.com/oauth/authorize', tokenUrl: 'https://api.hubapi.com/oauth/v1/token', scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'], usePkce: false, secretInBody: true, envKey: 'HUBSPOT' },
  'zoho-crm': { authorizeUrl: 'https://accounts.zoho.com/oauth/v2/auth', tokenUrl: 'https://accounts.zoho.com/oauth/v2/token', scopes: ['ZohoCRM.modules.contacts.READ'], usePkce: false, secretInBody: true, envKey: 'ZOHO_CRM' },
  dropbox: { authorizeUrl: 'https://www.dropbox.com/oauth2/authorize', tokenUrl: 'https://api.dropboxapi.com/oauth2/token', scopes: ['files.metadata.read', 'files.content.write'], usePkce: true, secretInBody: false, envKey: 'DROPBOX' },
  box: { authorizeUrl: 'https://account.box.com/api/oauth2/authorize', tokenUrl: 'https://api.box.com/oauth2/token', scopes: [], usePkce: false, secretInBody: true, envKey: 'BOX' },
  fitbit: { authorizeUrl: 'https://www.fitbit.com/oauth2/authorize', tokenUrl: 'https://api.fitbit.com/oauth2/token', scopes: ['activity', 'profile'], usePkce: true, secretInBody: false, envKey: 'FITBIT' },
  strava: { authorizeUrl: 'https://www.strava.com/oauth/mobile/authorize', tokenUrl: 'https://www.strava.com/oauth/token', scopes: ['profile:read_all', 'activity:read_all'], usePkce: false, secretInBody: true, envKey: 'STRAVA' },
  oura: { authorizeUrl: 'https://cloud.ouraring.com/oauth/authorize', tokenUrl: 'https://api.ouraring.com/v1/oauth/token', scopes: ['personal'], usePkce: false, secretInBody: true, envKey: 'OURA' },
  withings: { authorizeUrl: 'https://account.withings.com/oauth2_user/authorize2', tokenUrl: 'https://wbs-api.withings.net/v2/oauth2', scopes: ['user.info', 'user.metrics'], usePkce: false, secretInBody: true, envKey: 'WITHINGS' },
  asana: { authorizeUrl: 'https://app.asana.com/-/oauth_authorize', tokenUrl: 'https://app.asana.com/-/oauth_token', scopes: [], usePkce: false, secretInBody: true, envKey: 'ASANA' },
  mastodon: { authorizeUrl: 'https://mastodon.social/oauth/authorize', tokenUrl: 'https://mastodon.social/oauth/token', scopes: ['read', 'write'], usePkce: true, secretInBody: false, envKey: 'MASTODON' },
  reddit: { authorizeUrl: 'https://www.reddit.com/api/v1/authorize', tokenUrl: 'https://www.reddit.com/api/v1/access_token', scopes: ['identity', 'submit'], usePkce: true, secretInBody: false, envKey: 'REDDIT' },
};

export function lookupOAuthProvider(destinationId: string): OAuthProviderProfile | null {
  return OAUTH_PROVIDERS[destinationId] ?? null;
}

export const OAUTH_REDIRECT_PATH = '/egress-universal/callback';
