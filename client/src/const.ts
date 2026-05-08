export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
//
// Defensive: if VITE_OAUTH_PORTAL_URL is unset (which is normal for Capacitor
// builds — there is no .env producing it), we used to throw `new URL(
// "undefined/app-auth")` which crashed the whole app at the call site of any
// hook that defaulted `redirectPath = getLoginUrl()` at parameter
// destructure time. Now we return an empty string in that case; callers
// that actually try to redirect will navigate to "" (no-op on Capacitor;
// stays on the current page on web).
export const getLoginUrl = (): string => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  if (!oauthPortalUrl || !appId) {
    return "";
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
