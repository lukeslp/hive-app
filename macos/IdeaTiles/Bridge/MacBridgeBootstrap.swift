import Foundation

enum MacBridgeBootstrap {
    static let javaScript = #"""
    (() => {
      'use strict';
      let sequence = 0;
      const handler = window.webkit?.messageHandlers?.ideaTilesBridge;
      const capabilities = Object.freeze({
        bridgeVersion: 1,
        nativeMac: true,
        features: Object.freeze({
          artifactGeneration: true,
          artifactPersistence: true,
          artifactExport: true,
          imagePlayground: true,
          keychain: true,
          staticPreview: true
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
        attachImageToBoard: async manifest => {
          const saved = await rpc('artifact.save', { manifest });
          const file = saved.files.find(candidate => candidate.mimeType.startsWith('image/'));
          if (!file) throw Object.assign(new Error('The artifact has no image to attach.'), { code: 'missingImage', retryable: false });
          await rpc('artifact.attachImage', { artifactId: saved.id, file });
        }
      });
      const generationSettings = Object.freeze({
        get: () => rpc('generation.settings.get', {}),
        set: settings => rpc('generation.settings.set', { settings })
      });
      const credentials = Object.freeze({
        status: () => rpc('credentials.status', {}),
        set: (provider, credential) => rpc('credentials.set', { provider, credential }),
        remove: provider => rpc('credentials.remove', { provider })
      });
      Object.defineProperty(window, 'ideaTilesMac', {
        value: Object.freeze({ capabilities, artifactStudioServices: services, generationSettings, credentials }),
        configurable: false,
        enumerable: true,
        writable: false
      });
    })();
    """#
}
