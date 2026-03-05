// Ensure Node-style globals exist before bundled CommonJS shims evaluate.
if (typeof globalThis.global === 'undefined') {
  globalThis.global = globalThis;
}

if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis;
}

if (typeof globalThis.window !== 'undefined' && typeof globalThis.window.global === 'undefined') {
  globalThis.window.global = globalThis;
}

if (typeof globalThis.crypto === 'undefined') {
  if (typeof globalThis.self !== 'undefined' && globalThis.self.crypto) {
    globalThis.crypto = globalThis.self.crypto;
  } else if (typeof globalThis.window !== 'undefined' && globalThis.window.crypto) {
    globalThis.crypto = globalThis.window.crypto;
  }
}
