// Minimal chainable fake standing in for supabase-js's PostgrestFilterBuilder.
// Every filter method (.eq/.is/.in/.order/.select/.single) just returns
// `this` so call chains of any shape resolve; `.then` makes the chain
// awaitable, matching the real client's thenable builder. Not a full
// supabase-js mock — only what these tools' query shapes touch.
type Result = { data: unknown; error: { message: string } | null }

export function fakeQuery(result: Result) {
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    is: () => q,
    in: () => q,
    order: () => q,
    single: () => q,
    then: (resolve: (r: Result) => void) => resolve(result),
  }
  return q
}

export function ok(data: unknown) {
  return fakeQuery({ data, error: null })
}

export function fail(message: string) {
  return fakeQuery({ data: null, error: { message } })
}

// Builds a `db.from(table) => ...` router from a per-table map of fake
// queries (or a function of call index, for tools that hit the same table
// more than once with different expected results).
export function fakeDb(byTable: Record<string, unknown | (() => unknown)>) {
  return {
    from: (table: string) => {
      const entry = byTable[table]
      if (entry === undefined) throw new Error(`fakeDb: no fixture for table "${table}"`)
      return typeof entry === 'function' ? (entry as () => unknown)() : entry
    },
  }
}
