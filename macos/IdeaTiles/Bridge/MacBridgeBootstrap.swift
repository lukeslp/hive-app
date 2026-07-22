import Foundation

struct MacRuntimeCapabilities: Equatable, Sendable {
    let artifactGeneration: Bool
    let artifactPersistence: Bool
    let artifactExport: Bool
    let imagePlayground: Bool
    let keychain: Bool
    let staticPreview: Bool

    static func configured(
        artifactGeneration: Bool,
        imagePlayground: Bool,
        keychain: Bool
    ) -> Self {
        Self(
            artifactGeneration: artifactGeneration,
            artifactPersistence: true,
            artifactExport: true,
            imagePlayground: imagePlayground,
            keychain: keychain,
            staticPreview: true
        )
    }

    static let fullyAvailable = configured(
        artifactGeneration: true,
        imagePlayground: true,
        keychain: true
    )

    var jsonValue: JSONValue {
        .object([
            "bridgeVersion": .number(1),
            "nativeMac": .bool(true),
            "features": .object([
                "artifactGeneration": .bool(artifactGeneration),
                "artifactPersistence": .bool(artifactPersistence),
                "artifactExport": .bool(artifactExport),
                "imagePlayground": .bool(imagePlayground),
                "keychain": .bool(keychain),
                "staticPreview": .bool(staticPreview),
            ]),
        ])
    }
}

enum MacBridgeBootstrap {
    static func javaScript(capabilities: MacRuntimeCapabilities) -> String {
        #"""
        (() => {
          'use strict';
          let sequence = 0;
          const handler = window.webkit?.messageHandlers?.ideaTilesBridge;
          const capabilities = Object.freeze({
            bridgeVersion: 1,
            nativeMac: true,
            features: Object.freeze({
              artifactGeneration: \#(capabilities.artifactGeneration),
              artifactPersistence: \#(capabilities.artifactPersistence),
              artifactExport: \#(capabilities.artifactExport),
              imagePlayground: \#(capabilities.imagePlayground),
              keychain: \#(capabilities.keychain),
              staticPreview: \#(capabilities.staticPreview)
            })
          });
          const rpc = async (method, params, timeoutMs = 35000) => {
            if (!handler) throw Object.assign(new Error('Native bridge unavailable.'), { code: 'bridgeUnavailable', retryable: true });
            const id = `rpc:${Date.now()}:${++sequence}`;
            let timer = null;
            try {
              const nativeReply = handler.postMessage({ id, method, params });
              const reply = timeoutMs == null ? await nativeReply : await Promise.race([
                nativeReply,
                new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Native request timed out.'), { code: 'timeout', retryable: true })), timeoutMs); })
              ]);
              if (!reply || reply.id !== id) throw Object.assign(new Error('Native response ID mismatch.'), { code: 'responseMismatch', retryable: false });
              if (!reply.ok) throw Object.assign(new Error(reply.error?.message || 'Native request failed.'), reply.error || {});
              if (reply.method !== method) throw Object.assign(new Error('Native response method mismatch.'), { code: 'responseMismatch', retryable: false });
              return reply.result;
            } finally {
              if (timer !== null) clearTimeout(timer);
            }
          };
          const services = Object.freeze({
            generator: Object.freeze({
              generate: async (request, options = {}) => {
                options.onProgress?.({ requestId: request.requestId, phase: 'preparing', completed: 0 });
                const cancel = () => { void rpc('artifact.cancel', { requestId: request.requestId }).catch(() => {}); };
                options.signal?.addEventListener('abort', cancel, { once: true });
                try { return await rpc('artifact.generate', request, request.recipeId === 'image-playground-artwork' ? null : 35000); }
                finally { options.signal?.removeEventListener('abort', cancel); }
              }
            }),
            persistence: Object.freeze({
              save: manifest => rpc('artifact.save', { manifest }),
              export: async manifest => { await rpc('artifact.export', { manifest }, null); }
            }),
            attachImageToBoard: async (manifest, targetNodeId) => {
              const saved = await rpc('artifact.save', { manifest });
              const file = saved.files.find(candidate => candidate.mimeType.startsWith('image/'));
              if (!file) throw Object.assign(new Error('The artifact has no image to attach.'), { code: 'missingImage', retryable: false });
              return rpc('artifact.attachImage', { artifactId: saved.id, targetNodeId, file });
            }
          });
          const generationSettings = Object.freeze({
            get: () => rpc('generation.settings.get', {}),
            set: settings => rpc('generation.settings.set', { settings })
          });
          const settings = Object.freeze({
            open: () => rpc('settings.open', {})
          });
          const workspacePersistence = Object.freeze({
            saveBoard: input => rpc('workspace.saveBoard', input)
          });
          const fileExports = Object.freeze({
            save: input => rpc('file.save', input, null)
          });
          const workspaceImportListeners = new Set();
          const pendingWorkspaceImports = [];
          window.addEventListener('ideatiles:nativeWorkspaceImport', event => {
            if (workspaceImportListeners.size === 0) pendingWorkspaceImports.push(event.detail);
            else workspaceImportListeners.forEach(listener => listener(event.detail));
          });
          const workspaceImports = Object.freeze({
            subscribe: listener => {
              if (typeof listener !== 'function') throw new TypeError('Workspace import listener must be a function.');
              workspaceImportListeners.add(listener);
              pendingWorkspaceImports.splice(0).forEach(envelope => listener(envelope));
              return () => workspaceImportListeners.delete(listener);
            }
          });
          const generation = Object.freeze({
            generate: input => rpc('generation.generateText', input)
          });
          const credentials = Object.freeze({
            status: () => rpc('credentials.status', {}),
            set: (provider, credential) => rpc('credentials.set', { provider, credential }),
            remove: provider => rpc('credentials.remove', { provider })
          });
          const dreamer = Object.freeze({
            status: () => rpc('dreamer.status', {}),
            profile: () => rpc('dreamer.profile', {}),
            redeem: inviteCode => rpc('dreamer.redeem', { inviteCode }),
            remove: () => rpc('dreamer.remove', {}),
            requestAccess: () => rpc('dreamer.requestAccess', {})
          });
          const auth = Object.freeze({
            signIn: async loginURL => {
              const result = await rpc('auth.signIn', { loginURL }, null);
              return result?.authenticated === true;
            }
          });
          Object.defineProperty(window, 'ideaTilesMac', {
            value: Object.freeze({ capabilities, artifactStudioServices: services, workspacePersistence, workspaceImports, fileExports, generation, generationSettings, settings, credentials, dreamer, auth }),
            configurable: false,
            enumerable: true,
            writable: false
          });
        })();
        """#
    }
}
