// ─── App rules: the single source of truth ─────────────────────────────────────────────────────────
// Every limit the app enforces lives here. The code that enforces a rule imports it from this file, and the
// About page (Settings → About / sidebar "How the app works") reads the SAME values, so the page can never
// show a number the app doesn't actually use.
//
// When you add, change or remove a rule:
//   1. change it here (or in the code that enforces it),
//   2. update its text in src/shared/about.ts and add a line to ABOUT_CHANGELOG there,
//   3. run `npm run rules:sync`.
// `npm run rules:check` fails while rule code has changed but the About page hasn't been updated.

export const RULES = {
  /** Sale / purchase invoices can be edited or deleted for this long after they are created. Then locked for everyone. */
  editWindowHours: 24,
  /** Erase mode stays on this long after the PIN is entered. */
  eraseMinutes: 10,
  /** Wrong PIN tries (erase / master / expense PIN) before the PIN is locked… */
  pinMaxTries: 5,
  /** …for this many minutes. */
  pinLockMinutes: 15,
  /** Sign-in: wrong passwords allowed per account + device network… */
  loginMaxTries: 5,
  /** …within this window. */
  loginWindowMinutes: 15,
  /** Automatic restore point: taken when the last one is older than this. */
  dailySnapshotHours: 20,
  /** Restore points kept: newest daily copies… */
  keepDailySnapshots: 14,
  /** …and newest of the others (before restore, before fresh start, manual). */
  keepOtherSnapshots: 20,
  /** Backup file saved to the chosen computer folder every this many days. */
  folderBackupDays: 7,
  /** PIN length (erase / master PIN and expense PIN), digits only. */
  pinMinDigits: 4,
  pinMaxDigits: 8,
  /** Product codes (SKU) are given automatically: prefix + a running number, e.g. ALU-00012. */
  skuPrefix: 'ALU',
  skuDigits: 5,
} as const;

/** Product code for running number n, e.g. 12 -> "ALU-00012". */
export const skuFor = (n: number) => `${RULES.skuPrefix}-${String(n).padStart(RULES.skuDigits, '0')}`;

export const MIN_MS = 60 * 1000;
export const HOUR_MS = 60 * MIN_MS;
export const DAY_MS = 24 * HOUR_MS;

/** A valid PIN: digits only, pinMinDigits–pinMaxDigits long. */
export const PIN_RE = new RegExp(`^\\d{${RULES.pinMinDigits},${RULES.pinMaxDigits}}$`);
