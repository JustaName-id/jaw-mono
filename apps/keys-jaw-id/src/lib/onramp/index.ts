// Public, CLIENT-SAFE surface for the onramp layer: types only.
//
// Server code (API routes) imports the registry from './registry' directly.
// Keeping providers/registry out of this barrel ensures importing onramp types
// in a client component never pulls server-only node:crypto into the bundle.
export * from './types';
