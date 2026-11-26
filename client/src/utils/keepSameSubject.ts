/**
 * react-query placeholderData: while only the time window moves (auto-refresh), keep showing
 * the previous result instead of an empty spinner, but never another machine's or tag's data.
 * `subject` is the query-key prefix that identifies what is shown; the rest is the time range.
 * @param subject
 */
export const keepSameSubject =
  (subject: readonly unknown[]) =>
  <T>(previous: T | undefined, previousQuery?: { queryKey: readonly unknown[] }): T | undefined =>
    previousQuery &&
    JSON.stringify(previousQuery.queryKey.slice(0, subject.length)) === JSON.stringify(subject)
      ? previous
      : undefined;
