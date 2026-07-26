/**
 * Strategic App Store / Play review gating for the Capacitor shell.
 * Cold opens never credit — only successful exports do.
 */

const STORAGE_KEY = "ideatiles-review-prompt-v1";
const SESSION_GAP_MS = 6 * 60 * 60 * 1000;

const REQUIREMENTS = {
  minimumSessions: 3,
  minimumUseAgeMs: 7 * 24 * 60 * 60 * 1000,
  minimumExports: 2,
  requestCooldownMs: 120 * 24 * 60 * 60 * 1000,
};

interface State {
  firstUseAt: number | null;
  sessionCount: number;
  lastSessionAt: number | null;
  exportCount: number;
  lastRequestAt: number | null;
  lastRequestedVersion: string | null;
}

function empty(): State {
  return {
    firstUseAt: null,
    sessionCount: 0,
    lastSessionAt: null,
    exportCount: 0,
    lastRequestAt: null,
    lastRequestedVersion: null,
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as Partial<State>;
    return {
      firstUseAt: typeof p.firstUseAt === "number" ? p.firstUseAt : null,
      sessionCount: Number(p.sessionCount) || 0,
      lastSessionAt: typeof p.lastSessionAt === "number" ? p.lastSessionAt : null,
      exportCount: Number(p.exportCount) || 0,
      lastRequestAt: typeof p.lastRequestAt === "number" ? p.lastRequestAt : null,
      lastRequestedVersion:
        typeof p.lastRequestedVersion === "string" ? p.lastRequestedVersion : null,
    };
  } catch {
    return empty();
  }
}

function save(state: State) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function recordReviewSession(now = Date.now()) {
  const state = load();
  if (state.firstUseAt == null) state.firstUseAt = now;
  if (state.lastSessionAt != null && now - state.lastSessionAt < SESSION_GAP_MS) {
    return;
  }
  state.sessionCount += 1;
  state.lastSessionAt = now;
  save(state);
}

function shouldRequest(state: State, appVersion: string, now: number) {
  if (!appVersion || state.firstUseAt == null) return false;
  if (state.sessionCount < REQUIREMENTS.minimumSessions) return false;
  if (state.exportCount < REQUIREMENTS.minimumExports) return false;
  if (now - state.firstUseAt < REQUIREMENTS.minimumUseAgeMs) return false;
  if (state.lastRequestedVersion === appVersion) return false;
  if (
    state.lastRequestAt != null &&
    now - state.lastRequestAt < REQUIREMENTS.requestCooldownMs
  ) {
    return false;
  }
  return true;
}

async function appVersion(): Promise<string> {
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    if (info?.version) return String(info.version);
  } catch {
    /* fall through */
  }
  return "1.3.1";
}

/** Call after a successful native/web export the person initiated. */
export async function noteExportAndMaybeRequestReview() {
  const state = load();
  state.exportCount += 1;
  save(state);

  const version = await appVersion();
  if (!shouldRequest(state, version, Date.now())) return;

  try {
    const { Capacitor } = await import("@capacitor/core");
    // App Store path only for now — Android In-App Review is untested here.
    if (Capacitor.getPlatform() !== "ios") return;
    const { InAppReview } = await import("@capacitor-community/in-app-review");
    await new Promise((r) => setTimeout(r, 2500));
    const fresh = load();
    if (!shouldRequest(fresh, version, Date.now())) return;
    await InAppReview.requestReview();
    fresh.lastRequestAt = Date.now();
    fresh.lastRequestedVersion = version;
    save(fresh);
  } catch {
    /* system may suppress; leave eligibility for later */
  }
}
