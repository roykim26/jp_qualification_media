/**
 * Helpers behind `scripts/package-scripts.test.mjs`.
 *
 * Why this file exists: the guard originally read `package.json` and `git
 * ls-files` inline, so the only way to exercise the "tracked" half was for the
 * repository to happen to contain an untracked file referenced by a script.
 * Once the one such entry was removed, deleting the tracked check outright left
 * the suite green — the assertion had no sample that could fail. The checks
 * below take their inputs as parameters so a test can hand them a fixture.
 */

/**
 * Pull the file path out of a script command, or null if it runs no repo file.
 *
 * Only the first match is returned: a command like `node --test a.mjs b.mjs`
 * names several files, and checking the first is enough to catch the class of
 * mistake this guards (a script entry that outlived its file).
 */
export function referencedFile(command) {
  const match = command.match(
    /(?:^|\s)((?:scripts|apps|services|packages)\/\S+\.(?:mjs|cjs|js|ts))/,
  );
  return match ? match[1] : null;
}

/**
 * Scripts naming a repo file that does not exist on disk.
 *
 * @param {Record<string, string>} scripts - the `scripts` block of package.json
 * @param {(file: string) => boolean} fileExists - injected so tests can lie
 * @returns {string[]} `name -> file` for each broken entry, in package order
 */
export function findMissingFiles(scripts, fileExists) {
  const broken = [];
  for (const [name, command] of Object.entries(scripts)) {
    const file = referencedFile(command);
    if (file && !fileExists(file)) broken.push(`${name} -> ${file}`);
  }
  return broken;
}

/**
 * Scripts naming a repo file that git does not track.
 *
 * Existence is not enough: an untracked file exists for the author and for
 * nobody else, so the command works on the machine that added it and fails with
 * MODULE_NOT_FOUND in every fresh clone.
 *
 * @param {Record<string, string>} scripts - the `scripts` block of package.json
 * @param {Set<string> | string[]} tracked - repo-relative paths git knows about
 * @returns {string[]} `name -> file` for each untracked entry, in package order
 */
export function findUntrackedFiles(scripts, tracked) {
  const known = tracked instanceof Set ? tracked : new Set(tracked);
  const untracked = [];
  for (const [name, command] of Object.entries(scripts)) {
    const file = referencedFile(command);
    if (file && !known.has(file)) untracked.push(`${name} -> ${file}`);
  }
  return untracked;
}
