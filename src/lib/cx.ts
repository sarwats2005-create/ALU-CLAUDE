/** Join class names, skipping falsy values. Safe to import from server and client components. */
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
