import { useEffect, useState } from 'react';
import type { RunResultReader, RunScopeQuery, RunScopeResult } from './runArtifacts';

export function useRunScope(reader: RunResultReader | undefined, query: Omit<RunScopeQuery, 'cursor' | 'limit'>) {
  const key = JSON.stringify(query);
  const [navigation, setNavigation] = useState<{ reader?: RunResultReader; key: string; cursors: Array<string | undefined> }>({ reader, key, cursors: [undefined] });
  const cursors = navigation.reader === reader && navigation.key === key ? navigation.cursors : [undefined];
  const cursor = cursors.at(-1);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ reader: RunResultReader; key: string; cursor?: string; value?: RunScopeResult; error?: string }>();
  useEffect(() => {
    if (!reader) return;
    const controller = new AbortController();
    setState({ reader, key, cursor });
    reader.scope({ ...JSON.parse(key), cursor, limit: 40 }, controller.signal).then(value => {
      if (!controller.signal.aborted) setState({ reader, key, cursor, value });
    }).catch(reason => {
      if (!controller.signal.aborted) setState({ reader, key, cursor, error: reason instanceof Error ? reason.message : 'Saved metrics could not be loaded. Retry this selection.' });
    });
    return () => controller.abort();
  }, [reader, key, cursor, attempt]);
  const current = state && state.reader === reader && state.key === key && state.cursor === cursor ? state : undefined;
  return {
    value: current?.value, error: current?.error, loading: !!reader && !current?.value && !current?.error,
    pageNumber: cursors.length, hasPrevious: cursors.length > 1,
    previous: () => { if (cursors.length > 1) setNavigation({ reader, key, cursors: cursors.slice(0, -1) }); },
    next: () => { if (current?.value?.restaurants.nextCursor) setNavigation({ reader, key, cursors: [...cursors, current.value.restaurants.nextCursor] }); },
    retry: () => setAttempt(value => value + 1),
  };
}
