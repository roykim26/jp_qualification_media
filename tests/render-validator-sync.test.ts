import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The renderer and its validator are two files that must agree, and nothing in
 * the build enforces that they do.
 *
 * `apps/web/src/server.ts` checks an upstream body with `isQualificationView()`
 * before handing it to `apps/web/src/render.ts`. The checks there were written
 * by measuring which fields actually throw when they are null (Sprint 3K/3M),
 * so the two lists agree *today*. They stop agreeing the moment someone adds
 * `fact.someNewField` to the renderer: the renderer will dereference a field
 * the validator never checked, and a null there throws after the 200 header is
 * sent -- a blank page, which is exactly the failure 3K fixed one field at a
 * time.
 *
 * This test turns "someone should remember" into a build failure. It is
 * deliberately textual rather than type-aware: a compiler-API check would
 * understand narrowing, but it would also need to model `unknown` flowing
 * through `readJson<T>()`, which the types do not actually track (`T` is a
 * promise the caller makes, not something the compiler verifies). Reading both
 * files as text asks the question that matters -- "does the renderer touch a
 * field the validator does not check?" -- without pretending the types prove
 * something they do not.
 */

const renderSource = readFileSync(
  new URL('../apps/web/src/render.ts', import.meta.url),
  'utf8',
);
const serverSource = readFileSync(
  new URL('../apps/web/src/server.ts', import.meta.url),
  'utf8',
);

/** The text between the braces of `function <name>(...)` in `source`. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name}() not found`);
  const open = source.indexOf('{', start);
  if (open < 0) throw new Error(`${name}() has no body`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`${name}() has an unbalanced body`);
}

/**
 * Fields read off `entity` without optional chaining.
 *
 * `fact.sourceUrl` inside `if (fact.sourceUrl)` counts: the guard is a truth
 * check, so a `null` there skips the branch rather than throwing, but the same
 * field is dereferenced unconditionally elsewhere in the file and the
 * allow-list below is per field, not per call site. Being conservative here
 * means a newly added unguarded read always shows up.
 */
function unguardedReads(source: string, entity: string): Set<string> {
  const pattern = new RegExp(`(?<!\\?\\.)\\b${entity}\\.([A-Za-z_]\\w*)`, 'g');
  const fields = new Set<string>();
  for (const match of source.matchAll(pattern)) fields.add(match[1]);
  return fields;
}

/** Fields `isQualificationView()` inspects on the two shapes it guards. */
function validatedFields(entity: string): Set<string> {
  return unguardedReads(
    functionBody(serverSource, 'isQualificationView'),
    entity,
  );
}

/**
 * Fields the renderer may read without the validator checking them, each with
 * the reason a bad value degrades visibly instead of throwing.
 *
 * Every entry is a promise about the renderer. `every allow-listed field is
 * still read by the renderer` below keeps the list from rotting into a pile of
 * names nobody dares delete.
 */
const allowList: Record<string, string> = {
  deliveryMode:
    'optional in the schema; only ever passed to .filter(Boolean) and String()',
  examComponent:
    'optional in the schema; only ever passed to .filter(Boolean) and String()',
  examLevelId:
    'nullable in the schema; only ever passed to .filter(Boolean), String(), or JSON.stringify',
  examSession:
    'nullable; read inside `if (fact.examSession)`, so a bad value skips the branch',
  normalizedValue:
    'z.unknown() by design; every reader guards with `typeof ... !== "string"` first',
  paymentMethod:
    'optional in the schema; only ever passed to .filter(Boolean) and String()',
  provenanceStatus:
    'optional enum; only compared with ===, so an unknown value degrades to "not verified"',
  providerId:
    'optional in the schema; only ever passed to .filter(Boolean) and String()',
};

describe('renderer / validator field agreement', () => {
  it('checks every fact field the renderer dereferences', () => {
    const validated = validatedFields('fact');
    const unchecked = [...unguardedReads(renderSource, 'fact')]
      .filter((field) => !validated.has(field))
      .filter((field) => !(field in allowList))
      .sort();
    expect(unchecked).toEqual([]);
  });

  it('checks every qualification field the renderer dereferences', () => {
    const validated = validatedFields('qualification');
    const unchecked = [...unguardedReads(renderSource, 'qualification')]
      .filter((field) => !validated.has(field))
      .filter((field) => !(field in allowList))
      .sort();
    expect(unchecked).toEqual([]);
  });

  it('every allow-listed field is still read by the renderer', () => {
    const read = new Set([
      ...unguardedReads(renderSource, 'fact'),
      ...unguardedReads(renderSource, 'qualification'),
    ]);
    const stale = Object.keys(allowList)
      .filter((field) => !read.has(field))
      .sort();
    expect(stale).toEqual([]);
  });

  it('every allow-listed field is unchecked, not merely excused', () => {
    // If the validator starts checking one of these, the entry is dead weight
    // that hides the real reason the field is safe. Fail so it gets removed.
    const validated = new Set([
      ...validatedFields('fact'),
      ...validatedFields('qualification'),
    ]);
    const redundant = Object.keys(allowList)
      .filter((field) => validated.has(field))
      .sort();
    expect(redundant).toEqual([]);
  });

  it('reads the validator rather than trusting a hand-written copy of it', () => {
    // Guards the extraction itself: if `isQualificationView` is renamed or its
    // body stops being parseable, the two assertions above would compare
    // against an empty set and fail loudly -- but only if this helper is
    // actually finding fields. Pin a few fields we know are checked.
    expect([...validatedFields('fact')]).toEqual(
      expect.arrayContaining([
        'factKey',
        'displayValue',
        'examYear',
        'sourceId',
        'sourceSnapshotId',
      ]),
    );
    expect([...validatedFields('qualification')]).toEqual(
      expect.arrayContaining([
        'slug',
        'officialNameJa',
        'aliasesJa',
        'field',
        'category',
      ]),
    );
  });
});
