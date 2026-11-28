/**
 * The formatter moved to `packages/schema/src/display.ts` so that the public
 * updates API can compare rendered before/after values with the exact same
 * rules the page uses (P1-01). Re-exported here so existing render/test
 * imports keep working.
 */
export * from '../../../packages/schema/src/display.js';
