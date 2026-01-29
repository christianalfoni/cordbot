// Polyfill for import.meta in CommonJS bundles
if (typeof import.meta === 'undefined') {
  global.import = { meta: { url: `file://${__filename}` } };
}
