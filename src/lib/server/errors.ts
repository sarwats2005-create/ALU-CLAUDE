import type { DictKey, Params } from '@/lib/i18n';

export type FieldErrors = Record<string, { key: DictKey; params?: Params }>;

/** A user-facing failure. Messages are translation keys, rendered in the requester's language. */
export class AppError extends Error {
  constructor(
    public status: number,
    public key: DictKey,
    public params?: Params,
    public fieldErrors?: FieldErrors,
  ) {
    super(key);
  }
}

export const badRequest = (key: DictKey, params?: Params) => new AppError(400, key, params);
export const fieldError = (field: string, key: DictKey, params?: Params) =>
  new AppError(422, 'err.fixFields', undefined, { [field]: { key, params } });
export const forbidden = () => new AppError(403, 'err.forbidden');
export const notFound = () => new AppError(404, 'err.notFound');
export const conflict = (key: DictKey, params?: Params) => new AppError(409, key, params);

/** Collects field errors and throws them all at once. */
export class Validator {
  errors: FieldErrors = {};
  add(field: string, key: DictKey, params?: Params) {
    if (!this.errors[field]) this.errors[field] = { key, params };
  }
  get ok() {
    return Object.keys(this.errors).length === 0;
  }
  throwIfAny() {
    if (!this.ok) throw new AppError(422, 'err.fixFields', undefined, this.errors);
  }
}
