/** Sibling-name policy (PLANNING.md §6): active siblings must be uniquely
 *  named case-insensitively; automatic creates suffix a clash ` (1)`,
 *  ` (2)`, … The DB unique index enforces it; this helper picks a free name.
 *  Explicit renames onto an existing name stay a validation error (task 2.2).
 */
export type NameTaken = (candidate: string) => Promise<boolean>

/** Upper bound on suffix probing; a real drive never has 999 same-named siblings. */
const MAX_SUFFIX = 999

/** Resolve `name` to the first free candidate, suffixing ` (n)` on clashes. */
export async function uniqueName(name: string, isTaken: NameTaken): Promise<string> {
  if (!(await isTaken(name))) return name
  for (let n = 1; n <= MAX_SUFFIX; n++) {
    const candidate = `${name} (${n})`
    if (!(await isTaken(candidate))) return candidate
  }
  throw new Error(`No free name found for "${name}" after ${MAX_SUFFIX} suffixes`)
}
