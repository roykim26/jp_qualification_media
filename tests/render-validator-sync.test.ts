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

/**
 * The text between the braces of `function <name>(...)` in `source`.
 *
 * The parameter list is skipped first, by counting parentheses. Without that,
 * a default parameter written as `query: SchedulePageQuery = {}` puts a `{`
 * before the real body and the slice starts inside the signature -- which is
 * how the sibling routes below (`renderSchedulePage`, `renderUpdatesPage`) are
 * declared.
 */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name}() not found`);
  const parametersOpen = source.indexOf('(', start);
  let parametersDepth = 0;
  let parametersClose = -1;
  for (let index = parametersOpen; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') parametersDepth += 1;
    else if (character === ')') {
      parametersDepth -= 1;
      if (parametersDepth === 0) {
        parametersClose = index;
        break;
      }
    }
  }
  if (parametersClose < 0)
    throw new Error(`${name}() has unbalanced parameters`);
  const open = source.indexOf('{', parametersClose);
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
  capturedAt:
    'optional in the schema; read inside `fact.capturedAt ? ...` and stringified, so a bad value only changes the provenance label',
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
  publishedAt:
    'optional in the schema; read inside `fact.publishedAt ? ...` and stringified, so a bad value only changes the provenance label',
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

/**
 * The three sibling routes (`/schedule/`, `/compare/`, `/updates/`) have the
 * same arrangement: a validator in `server.ts` guards a body the renderer then
 * dereferences. The gap there was found by hand in
 * `docs/audit/SIBLING_ROUTE_SHAPE_GAPS_2026-11-25.md` -- three fields were
 * exempted with a reason that turned out to be wrong, and each one was a
 * blank page in production. This block is what makes the next one show up as a
 * build failure instead.
 *
 * Each gate pairs one renderer function with the one validator that guards its
 * input, and exempts fields *per route*, because the same upstream field can
 * need different checks on pages that read it differently: `examYear` is
 * checked on `/schedule/` (a bad value is silently filtered out of the date
 * window) and exempt on `/compare/` and `/updates/` (it degrades to a visible
 * label). A single global allow-list would have to pick one answer and would
 * be wrong on two of the three pages.
 */
interface RouteGate {
  /** Renderer function in `render.ts` that reads the shape. */
  renderer: string;
  /** Validator in `server.ts` that guards the same shape. */
  validator: string;
  /** Identifier the renderer reads fields off. */
  entity: string;
  /** Parameter name the validator inspects (differs for helpers). */
  validated: string;
  /** Exempted fields, each with the reason a bad value degrades visibly. */
  allow: Record<string, string>;
  /** Fields known to be checked; guards the extraction against going empty. */
  pinned: string[];
}

const routeGates: RouteGate[] = [
  {
    renderer: 'renderSchedulePage',
    validator: 'isCalendarEnvelope',
    entity: 'event',
    validated: 'event',
    allow: {
      deliveryMode:
        'optional in the schema; only ever passed to .filter(Boolean) and String() in the qualification label',
      examComponent:
        'optional in the schema; only ever passed to .filter(Boolean) and String() in the qualification label',
      examLevelId:
        'nullable in the schema; only ever passed to .filter(Boolean) and String() in the qualification label',
      examYear:
        'renders a literal `null年` in the year filter, the row label and the ICS link; measured 200 with the full page',
      id: 'only feeds encodeURIComponent() in the ICS link',
      providerId:
        'optional in the schema; only ever passed to .filter(Boolean) and String() in the qualification label',
      verifiedAt: 'renders as 未確認 through formatSiteDateTime()',
    },
    pinned: ['type', 'label', 'factKey', 'dateValue', 'qualification'],
  },
  {
    // The qualification the schedule groups by is the upstream one, so it must
    // carry a usable identity: `renderSchedulePage()` reads `.slug` and
    // `.officialNameJa` off it.
    renderer: 'renderSchedulePage',
    validator: 'hasQualificationIdentity',
    entity: 'qualification',
    validated: 'value',
    allow: {},
    pinned: ['slug', 'officialNameJa'],
  },
  {
    renderer: 'renderComparePage',
    validator: 'isComparisonEnvelope',
    entity: 'entry',
    validated: 'entry',
    allow: {
      deliveryMode:
        'optional in the schema; passed to the dimension object as `?? null` and to formatFactDisplayValue(), which stringifies',
      examComponent:
        'optional in the schema; passed to the dimension object as `?? null` and to formatFactDisplayValue(), which stringifies',
      examLevelId:
        'nullable in the schema; passed to the dimension object as `?? null` and to formatFactDisplayValue(), which stringifies',
      examSession:
        'nullable in the schema; passed to the dimension object as `?? null` and to formatFactDisplayValue(), which stringifies',
      examYear:
        'printed as `適用年度: ${entry.examYear}年`, degrading to a visible `null年`; rejecting the whole table over one year label is the worse trade',
      paymentMethod:
        'optional in the schema; passed to the dimension object as `?? null` and to formatFactDisplayValue(), which stringifies',
      providerId:
        'optional in the schema; passed to the dimension object as `?? null` and to formatFactDisplayValue(), which stringifies',
    },
    pinned: ['factKey', 'value', 'sourceUrl'],
  },
  {
    renderer: 'renderComparePage',
    validator: 'isComparisonEnvelope',
    entity: 'row',
    validated: 'row',
    allow: {},
    pinned: ['label', 'cells'],
  },
  {
    renderer: 'renderComparePage',
    validator: 'isComparisonEnvelope',
    entity: 'cell',
    validated: 'cell',
    allow: {
      missingReason:
        'only rendered as text when the cell has no entries; measured 200 with the full page',
    },
    pinned: ['entries'],
  },
  {
    // Same entity name as the schedule's, but a different source: on
    // `/compare/` the `qualification` reads are split between the local
    // `allQualifications` list (which supplies `aliasesJa` and `category` to
    // the selector) and the comparison's own copy (which supplies `slug` and
    // `officialNameJa` to the table header). Only the latter comes from
    // upstream, and only those two fields are pinned here. A textual check
    // cannot tell the two apart, so a future read of `aliasesJa` off the
    // *upstream* copy would slip through -- recorded as an open item in the
    // report rather than papered over.
    renderer: 'renderComparePage',
    validator: 'hasQualificationIdentity',
    entity: 'qualification',
    validated: 'value',
    allow: {
      aliasesJa:
        'read from the local allQualifications list, not from the comparison copy',
      category:
        'read from the local allQualifications list, not from the comparison copy',
    },
    pinned: ['slug', 'officialNameJa'],
  },
  {
    renderer: 'renderUpdatesPage',
    validator: 'isUpdatesEnvelope',
    entity: 'event',
    validated: 'event',
    allow: {
      eventType:
        'only ever becomes part of the batch key, never markup; measured 200 with the full page',
      examYear:
        'only ever becomes part of the batch key, never markup; measured 200 with the full page',
    },
    pinned: [
      'eventLabel',
      'factKey',
      'factLabel',
      'qualification',
      'affectedPages',
    ],
  },
];

function routeProblems(gate: RouteGate) {
  const rendered = unguardedReads(
    functionBody(renderSource, gate.renderer),
    gate.entity,
  );
  const checked = unguardedReads(
    functionBody(serverSource, gate.validator),
    gate.validated,
  );
  return {
    rendered,
    checked,
    unchecked: [...rendered]
      .filter((field) => !checked.has(field))
      .filter((field) => !(field in gate.allow))
      .sort(),
    stale: Object.keys(gate.allow)
      .filter((field) => !rendered.has(field))
      .sort(),
    redundant: Object.keys(gate.allow)
      .filter((field) => checked.has(field))
      .sort(),
  };
}

describe('sibling route field agreement', () => {
  for (const gate of routeGates) {
    const label = `${gate.renderer} / ${gate.validator} / ${gate.entity}`;

    it(`checks every field ${label} dereferences`, () => {
      expect(routeProblems(gate).unchecked).toEqual([]);
    });

    it(`every allow-listed field for ${label} is still read`, () => {
      // Keeps an exemption from outliving the read it excused: if the renderer
      // stops touching the field, the reason on the list is now a lie about
      // code that no longer exists.
      expect(routeProblems(gate).stale).toEqual([]);
    });

    it(`every allow-listed field for ${label} is unchecked, not merely excused`, () => {
      // If the validator starts checking one of these, the exemption hides the
      // real reason the field is safe. Fail so it gets deleted.
      expect(routeProblems(gate).redundant).toEqual([]);
    });

    it(`reads ${gate.validator} rather than an empty body`, () => {
      // A comparison between two empty sets always passes. Pin fields we know
      // the validator checks, so a renamed function or an unparseable body
      // fails here instead of turning the assertion above into a tautology.
      expect([...routeProblems(gate).checked]).toEqual(
        expect.arrayContaining(gate.pinned),
      );
    });
  }
});
