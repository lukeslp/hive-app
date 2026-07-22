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
          imagePlayground: false,
          keychain: false,
          staticPreview: true
        })
      });
      const rpc = async (method, params) => {
        if (!handler) throw Object.assign(new Error('Native bridge unavailable.'), { code: 'bridgeUnavailable', retryable: true });
        const id = `rpc:${Date.now()}:${++sequence}`;
        const reply = await Promise.race([
          handler.postMessage({ id, method, params }),
          new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Native request timed out.'), { code: 'timeout', retryable: true })), 35000))
        ]);
        if (!reply || reply.id !== id) throw Object.assign(new Error('Native response ID mismatch.'), { code: 'responseMismatch', retryable: false });
        if (!reply.ok) throw Object.assign(new Error(reply.error?.message || 'Native request failed.'), reply.error || {});
        if (reply.method !== method) throw Object.assign(new Error('Native response method mismatch.'), { code: 'responseMismatch', retryable: false });
        return reply.result;
      };
      const services = Object.freeze({
        generator: Object.freeze({
          generate: async (request, options = {}) => {
            options.onProgress?.({ requestId: request.requestId, phase: 'preparing', completed: 0 });
            const cancel = () => { void rpc('artifact.cancel', { requestId: request.requestId }).catch(() => {}); };
            options.signal?.addEventListener('abort', cancel, { once: true });
            try { return await rpc('artifact.generate', request); }
            finally { options.signal?.removeEventListener('abort', cancel); }
          }
        }),
        persistence: Object.freeze({
          save: manifest => rpc('artifact.save', { manifest }),
          export: async manifest => { await rpc('artifact.export', { manifest }); }
        }),
        attachImageToBoard: async manifest => {
          const saved = await rpc('artifact.save', { manifest });
          const file = saved.files.find(candidate => candidate.mimeType.startsWith('image/'));
          if (!file) throw Object.assign(new Error('The artifact has no image to attach.'), { code: 'missingImage', retryable: false });
          await rpc('artifact.attachImage', { artifactId: saved.id, file });
        }
      });
      Object.defineProperty(window, 'ideaTilesMac', {
        value: Object.freeze({ capabilities, artifactStudioServices: services }),
        configurable: false,
        enumerable: true,
        writable: false
      });
    })();
    """#
}
