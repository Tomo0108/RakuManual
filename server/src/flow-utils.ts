export function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}
