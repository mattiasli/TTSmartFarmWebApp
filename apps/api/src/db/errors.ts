export class RevisionConflictError extends Error {
  readonly code = 'REVISION';
  constructor(message = 'Settings were updated elsewhere. Reload and apply again.') {
    super(message);
    this.name = 'RevisionConflictError';
  }
}

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY';
  constructor(message = 'Idempotency key was reused with a different command.') {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

export class LastAdminError extends Error {
  readonly code = 'LAST_ADMIN';
  constructor(message = 'The farm must keep at least one active administrator.') {
    super(message);
    this.name = 'LastAdminError';
  }
}

export class AuthRecordExpiredError extends Error {
  readonly code = 'EXPIRED';
  constructor(message = 'The login or ticket is no longer valid.') {
    super(message);
    this.name = 'AuthRecordExpiredError';
  }
}

export class QueryWindowError extends Error {
  readonly code = 'QUERY_WINDOW';
  constructor(message = 'History requests cannot exceed 30 days or 2000 points.') {
    super(message);
    this.name = 'QueryWindowError';
  }
}

export function isPgCheckViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23514');
}

export function isPgUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');
}

export function isPgForeignKeyViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23503');
}
