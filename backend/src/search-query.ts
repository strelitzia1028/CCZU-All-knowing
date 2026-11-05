export function normalizeSearchTerm(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 100) : '';
}

export function parseSearchFields<T extends string>(
  value: unknown,
  allowedFields: readonly T[]
): Set<T> {
  const requested =
    typeof value === 'string'
      ? new Set(
          value
            .split(',')
            .map((field) => field.trim())
            .filter((field): field is T =>
              allowedFields.includes(field as T)
            )
        )
      : new Set<T>();

  return requested.size > 0 ? requested : new Set(allowedFields);
}

export function buildLikePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
}
