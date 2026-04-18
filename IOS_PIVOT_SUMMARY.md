# iOS pivot assessment for `hexpandroid`

Your correction materially changes the recommendation. After re-checking the repository with **iOS** in mind, my conclusion is that `hexpandroid` is **a reasonable base for an iOS pivot, but it is not yet an iOS app**. The codebase is fundamentally a **Capacitor-wrapped web client with a server backend**, and that architecture is favorable for iOS because most of the product logic already lives in shared TypeScript rather than Android-native code. However, the repository currently contains **only an Android native target**, no `ios/` project, and no `@capacitor/ios` dependency in the package manifest. [1] [2]

## Executive view

| Question | Answer |
|---|---|
| Is this already an iOS app? | No. The repo has `android/` but no `ios/` target, even though it uses Capacitor. [1] [2] |
| Is the architecture suitable for iOS? | Yes. Most app logic is in the shared client/server code rather than Android-native code. [2] [3] [4] |
| Is local on-device LLM inference a blocker for iOS? | Only if you keep it. The current local inference path is Android-specific, so the clean iOS path is to go cloud-only. [5] [6] [7] |
| Does cloud LLM support already exist? | Yes. The backend already exposes `/api/generate` and provider routing, and the native shell already points API calls to a hosted backend URL. [3] [4] |
| What is the main hidden issue? | Some server-backed features are currently disabled whenever the app runs inside a Capacitor shell, which would affect iOS too unless changed. [8] [9] |

The short version is that you should **pivot the product to “Capacitor mobile app with cloud LLMs” rather than “port the Android PoC to iOS.”** That is a much cleaner framing, and the repository is already closer to that than its name suggests. [2] [3] [4]

## What the repository actually is today

The package manifest and Capacitor configuration show a cross-platform web app foundation: React, Vite, Capacitor core tooling, and a web build output located at `dist/public`. The native wrapper that exists today is Android-only. [2] [10] The server side already contains a multi-provider LLM proxy with `/api/generate`, `/api/providers`, and `/api/share`, which means the app’s AI behavior does not have to live inside the mobile client at all. [3]

That is the strongest argument in favor of the iOS pivot. The repository is **not fundamentally native Android software**. It is a TypeScript application that currently happens to ship one native shell. [2] [3] [10]

## Why the current local-model path should not come with you to iOS

The on-device inference implementation is explicitly Android-native. The project includes a `GemmaPlugin` written for Android, registers it from `MainActivity`, and links MediaPipe GenAI in the Android Gradle file. [5] [6] [7] The generation hook still contains a native/offline branch that calls this plugin when the app is running inside Capacitor and offline. [4]

> `if (isCapacitor() && isOffline()) { ... const { ready } = await Gemma.isModelReady(); ... const { text: gemmaText } = await Gemma.generate(...) }` [4]

That logic is not merely mobile-specific; it is **Android-specific**. There is no corresponding iOS native implementation in the repository. If you want the fastest path to an iOS app, the right move is to **remove this branch from the product direction**, not recreate it on a second native platform. [1] [4] [5] [6] [7]

## The good news: cloud generation already exists

The repository already has the pieces you would want for an iOS-first cloud architecture. The backend supports several providers and a default built-in provider through the LLM proxy. [3] The platform helper already routes Capacitor builds to an absolute hosted API base URL instead of relying on same-origin browser paths. [10] In the main app component, the primary generation requests I inspected already send provider-aware headers via `providerSettings.getRequestHeaders()`, which is exactly the kind of mobile-safe architecture you want when inference lives in the cloud. [11]

| Existing cloud-ready piece | Why it matters for iOS |
|---|---|
| `server/llmProxy.ts` | Keeps AI provider complexity on the server rather than in the app bundle. [3] |
| `client/src/lib/platform.ts` | Already distinguishes Capacitor native shells from the web and points native builds at a hosted API. [10] |
| `client/src/pages/HexpandApp.tsx` | Main generation flows already call the backend with provider-aware headers. [11] |
| `client/src/hooks/useProviderSettings.ts` | Provider state and request-header generation already exist in the client. [12] |

So the iOS pivot is **not blocked by missing cloud architecture**. The architecture is there. The work is mostly about making it **consistently mobile-safe and platform-neutral**. [3] [10] [11] [12]

## The most important issue I found for iOS

The biggest non-obvious problem is that some features are presently disabled whenever the app is in a Capacitor shell, regardless of whether that shell is Android or a future iOS build. In `useAuth`, the `auth.me` query is disabled when `isCapacitor()` is true. [8] In `useSessionManagement`, the database-backed session list query is also disabled when the app is running inside Capacitor. [9]

That means a future iOS build would inherit a surprising limitation: **native mobile may not behave like the web app for authentication and cloud session features unless you deliberately change those guards**. [8] [9]

This matters more than the Gemma code, because the Gemma code is easy to remove conceptually. The Capacitor-wide feature disablement is the kind of thing that can make an iOS app feel mysteriously incomplete even after the shell builds successfully. [8] [9]

## My recommendation for the iOS pivot

I would treat the current repository as a **shared mobile/web app foundation** and then make the pivot in three deliberate steps.

| Step | Recommendation | Rationale |
|---|---|---|
| 1 | Commit to **cloud-only AI** for mobile | Avoids rebuilding Android-native Gemma logic for iOS. [3] [4] [5] [6] [7] |
| 2 | Add an iOS Capacitor target and keep the shared client/server architecture | Most of the app already lives above the native layer. [1] [2] [10] |
| 3 | Audit every `isCapacitor()` guard and decide which features should truly be disabled on mobile | This is the main risk to feature parity on iOS. [8] [9] [10] |

If you want the cleanest product direction, I would define it this way:

> **Hexpand becomes a Capacitor-based mobile app for iPhone and Android, with all AI generation routed through the hosted backend.**

That framing lets you reuse the current architecture instead of porting Android-specific experiments. [2] [3] [10] [11]

## Specific code areas I would change first

The first code changes I would prioritize are straightforward.

| Priority | File(s) | Change |
|---|---|---|
| High | `client/src/hooks/useAIGeneration.ts` | Remove the Gemma/offline branch so generation is always cloud-backed on mobile. [4] |
| High | `android/app/src/main/java/dev/dreamer/hexpand/GemmaPlugin.kt`, `android/app/src/main/java/dev/dreamer/hexpand/MainActivity.java`, `android/app/build.gradle` | Retire the Android-native Gemma path from the product architecture. [5] [6] [7] |
| High | `client/src/_core/hooks/useAuth.ts`, `client/src/hooks/useSessionManagement.ts` | Revisit Capacitor guards so iOS does not lose auth and cloud session behavior by default. [8] [9] |
| Medium | `client/src/hooks/useTemplates.ts` | Standardize provider-aware headers here too, so all generation flows are consistent. [12] [13] |
| Medium | `client/src/lib/platform.ts` | Make the native API base URL configurable rather than permanently hard-coded. [10] |

## Final assessment

`hexpandroid` is **not** something I would throw away if the goal is now iOS. On the contrary, it is a better iOS starting point than it looks, because the valuable parts of the application are already cross-platform. The repository’s real problem is not that it is “too Android.” Its real problem is that it currently mixes a good cloud-first TypeScript architecture with an unfinished Android-native inference experiment and a few broad Capacitor feature restrictions. [3] [4] [5] [8] [9] [10]

So my recommendation is clear: **yes, use this repo as the base for the iOS pivot, but pivot the architecture at the same time to cloud-only mobile AI and explicit mobile feature parity.** [3] [8] [9] [10] [11]

## References

[1]: ./ios-pivot-state.txt "Recorded iOS pivot repository state"
[2]: ./package.json "Project package manifest"
[3]: ./server/llmProxy.ts "Server LLM proxy"
[4]: ./client/src/hooks/useAIGeneration.ts "AI generation hook"
[5]: ./android/app/src/main/java/dev/dreamer/hexpand/GemmaPlugin.kt "Android Gemma plugin"
[6]: ./android/app/src/main/java/dev/dreamer/hexpand/MainActivity.java "Android main activity"
[7]: ./android/app/build.gradle "Android build configuration"
[8]: ./client/src/_core/hooks/useAuth.ts "Auth hook"
[9]: ./client/src/hooks/useSessionManagement.ts "Session management hook"
[10]: ./client/src/lib/platform.ts "Platform helper"
[11]: ./client/src/pages/HexpandApp.tsx "Main app page"
[12]: ./client/src/hooks/useProviderSettings.ts "Provider settings hook"
[13]: ./client/src/hooks/useTemplates.ts "Template generation hook"
