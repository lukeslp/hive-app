# hexpandroid inspection summary

I cloned `lukeslp/hexpandroid` into `/home/ubuntu/hexpandroid` and reviewed it specifically through the lens of your requested pivot: an **Android application whose LLM dependency is cloud-based rather than on-device**.

## Bottom line

The most important conclusion is that **this repository is already much closer to your target direction than it first appears**. It is not a pure native Android app; it is a **Capacitor-wrapped web application with an existing server backend and multi-provider cloud LLM proxy**. The current on-device Gemma path is best understood as a **PoC-side branch**, not the architectural center of the product. In other words, you do **not** need to reinvent the app to make it cloud-first; you mainly need to **remove or de-emphasize the native Gemma path and standardize all generation flows through the backend**. [1] [2] [3] [4]

## What the repository is today

| Area | Current state |
|---|---|
| App shell | Capacitor Android wrapper around the same client app used on the web [1] [5] |
| Frontend | React + Vite + TypeScript app with the same Hexpand spatial-brainstorming model [1] |
| Backend | Express server with `/api/generate`, `/api/providers`, `/api/share`, plus app/server plumbing [2] |
| Cloud LLM support | Already implemented through provider routing and a built-in default provider called `manus` [2] [3] |
| On-device path | Android-native `GemmaPlugin` backed by MediaPipe `tasks-genai` [4] [5] |
| Network readiness | Native app already has `INTERNET` permission and uses an absolute cloud base URL on Capacitor [6] [7] |

That means the repository is **not blocked by lack of cloud infrastructure**. It already has cloud infrastructure. The real work is to make the Android app **consistently depend on that cloud path** instead of carrying a partly-finished offline inference branch alongside it. [2] [3] [7]

## Why the current Android path still feels stuck

The native Gemma integration is clearly a proof of concept. The Android plugin assumes a local model file called `gemma3n-e4b.task`, checks whether it exists on device storage, and exposes `isModelReady()`, `downloadModel()`, and `generate()`. However, `downloadModel()` is not implemented as a real production download flow; it only creates the directory and reports that the user should manually place the model file in app storage. [4]

> "TODO: Implement actual download with progress reporting." [4]

That single detail explains a lot. The local-model route is not merely inconvenient; it is currently **structurally incomplete**. The Android build also explicitly pulls in the MediaPipe GenAI dependency, and `MainActivity` registers the native `GemmaPlugin`, which confirms that the local inference path is wired into the native shell rather than being a small experimental leftover. [5] [8]

## The key architectural finding

The **AI generation hook already supports cloud generation by default**, and only diverts to on-device Gemma under a very specific condition: **when the app is running inside Capacitor and the device is offline**. Otherwise it builds a request payload and POSTs it to the backend `/generate` endpoint. [3] [7]

This is a strong sign that the intended design direction was already drifting toward the cloud. The repository therefore does **not** need a conceptual pivot so much as an **implementation cleanup and consolidation**. [2] [3]

## Where cloud support already exists

The server-side proxy is the strongest evidence that the cloud-first version is already mostly present. It accepts a Gemini-style request body, normalizes it, and routes it to one of several cloud providers: `manus`, `gemini`, `anthropic`, `openai`, `grok`, `mistral`, or `ollama`. It also falls back to `manus` if the requested provider is unavailable or fails. [2]

| Capability | Evidence |
|---|---|
| Built-in default provider | `/providers` returns `default: "manus"` and marks it always available [2] |
| Multi-provider cloud routing | `resolveProvider()` and `callProviderWithContext()` support several hosted providers [2] |
| Native app cloud endpoint | `getApiBaseUrl()` returns `https://dr.eamer.dev/hexpand/api` in Capacitor builds [7] |
| Provider selection UI | `useProviderSettings()` already exposes provider choice and request-header generation [3] |

As a result, **hexpandroid already contains the foundation of the cloud-dependent Android app you want**. [2] [3] [7]

## The most important product gap I found

There is a mismatch between the **provider settings UI** and the **actual request code paths**. The provider settings hook correctly tracks provider choice, stores credentials, and exposes `getRequestHeaders()` with `X-Provider`, optional `X-API-Key`, and Ollama-specific headers. [3] However, the main generation request in `useAIGeneration.ts` currently sends only `Content-Type: application/json`, and the template-generation path in `useTemplates.ts` does the same. [9] [10]

That means the repository has the **appearance of configurable provider selection**, but the two important generation flows I checked are not yet consistently using those headers. In practice, that likely causes the backend to fall back to its default `manus` path more often than the settings UI suggests. [2] [3] [9] [10]

This is important for your pivot because a cloud-only Android app should be **boringly consistent**. All AI requests should go through one clearly defined cloud abstraction, and the UI should not promise provider-level control unless the requests really honor it. [2] [3] [9] [10]

## What I would change for the pivot

### Recommended implementation direction

| Priority | Recommendation | Why it matters |
|---|---|---|
| 1 | Remove the offline Gemma branch from `useAIGeneration.ts` | Makes cloud dependence explicit and simplifies behavior [3] |
| 2 | Delete `GemmaPlugin.kt`, unregister it from `MainActivity`, and remove the MediaPipe dependency from `android/app/build.gradle` | Eliminates native model baggage and reduces Android complexity [4] [5] [8] |
| 3 | Route **all** generation calls through provider-aware request headers from `useProviderSettings()` | Makes provider selection real, not cosmetic [3] [9] [10] |
| 4 | Move the Capacitor API base URL out of a hard-coded production domain and into environment/config management | Makes deployment safer and easier to change across environments [7] |
| 5 | Replace offline-generation fallback with a clean user-facing state such as “network required for AI expansion” | Aligns behavior with the new product direction [3] [7] |

### My practical assessment

If your goal is to ship an Android client that depends on cloud inference, the shortest path is **not** “build a new Android app from scratch.” The shortest path is:

1. keep the Capacitor app architecture,
2. keep the existing backend proxy,
3. remove native Gemma and offline inference assumptions,
4. standardize all AI calls through the backend, and
5. make provider configuration either fully functional or intentionally simplified to a single managed backend. [2] [3] [4] [5] [7] [9] [10]

## Current health of the repo

I also verified the basic development state locally.

| Check | Result |
|---|---|
| Clone | Successful |
| Dependency install | Successful with `pnpm install --frozen-lockfile` |
| Build | Successful with `pnpm build` |
| Tests | Successful with `pnpm test` |
| Git branch | `main` tracking `origin/main` |
| Working tree | Clean |

The recent commits also reinforce the story that this repo is still early and experimental. The history shows an initial Android PoC commit followed by cleanup and documentation work, which is consistent with a branch that proved the native idea and is now ready for consolidation. [11]

## Final recommendation

My recommendation is to treat `hexpandroid` as an **excellent pivot candidate**, not a dead end. The repo already contains your desired end state in partial form: a cloud-backed brainstorming app that can run inside an Android shell. The main work now is to **stop straddling two architectures**.

If you want a clean direction, I would define the next version as follows:

> **Hexpand for Android is a Capacitor-based mobile client whose AI generation always goes through the hosted backend API. Local model inference is removed.**

That would give you a simpler app, a clearer mental model, and a better deployment story than continuing to carry both a half-finished native inference path and a cloud backend at the same time. [2] [3] [4] [5] [7]

## References

[1]: ./package.json "Project package manifest"
[2]: ./server/llmProxy.ts "Server LLM proxy"
[3]: ./client/src/hooks/useProviderSettings.ts "Provider settings hook"
[4]: ./android/app/src/main/java/dev/dreamer/hexpand/GemmaPlugin.kt "Native Gemma plugin"
[5]: ./android/app/build.gradle "Android app Gradle config"
[6]: ./android/app/src/main/AndroidManifest.xml "Android manifest"
[7]: ./client/src/lib/platform.ts "Platform and API base URL helper"
[8]: ./android/app/src/main/java/dev/dreamer/hexpand/MainActivity.java "Main Android activity"
[9]: ./client/src/hooks/useAIGeneration.ts "AI generation hook"
[10]: ./client/src/hooks/useTemplates.ts "Template generation hook"
[11]: ./git-log.txt "Recent commit history noted during inspection"
