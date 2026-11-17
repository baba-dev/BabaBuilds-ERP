/** PostgreSQL string filters are case-sensitive unless the query mode is explicit. */
export function containsInsensitive(value: string) {
  return { contains: value, mode: "insensitive" as const };
}
