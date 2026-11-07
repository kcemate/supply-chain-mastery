import { useEffect, useState } from 'react';
import type { LocationImpact, Recommendation, SimulationDiagnostics } from './flywayTypes';
import type { RunPage, RunResultReader } from './runArtifacts';

interface PageTypes {
  impacts: LocationImpact;
  recommendations: Recommendation;
  warnings: string;
  constraints: SimulationDiagnostics['bindingConstraints'][number];
}

/** Cursor state is scoped to the exact reader; late responses cannot cross runs. */
export function useRunPage<K extends keyof PageTypes>(reader: RunResultReader, kind: K, enabled = true) {
  const [navigation, setNavigation] = useState<{ reader: RunResultReader; cursors: Array<string | undefined> }>({ reader, cursors: [undefined] });
  const cursors = navigation.reader === reader ? navigation.cursors : [undefined];
  const cursor = cursors.at(-1);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ reader: RunResultReader; cursor?: string; page?: RunPage<PageTypes[K]>; error?: string }>();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ reader, cursor });
    const load = reader[kind] as (cursor?: string, signal?: AbortSignal) => Promise<RunPage<PageTypes[K]>>;
    load.call(reader, cursor, controller.signal).then(page => {
      if (!controller.signal.aborted) setState({ reader, cursor, page });
    }).catch(reason => {
      if (!controller.signal.aborted) setState({ reader, cursor, error: reason instanceof Error ? reason.message : 'This result page could not be loaded. Retry to retrieve the saved data.' });
    });
    return () => controller.abort();
  }, [reader, kind, cursor, attempt, enabled]);
  const current = state?.reader === reader && state.cursor === cursor ? state : undefined;
  return {
    page: current?.page, error: current?.error,
    loading: enabled && !current?.page && !current?.error,
    pageNumber: cursors.length,
    previous: () => setNavigation({ reader, cursors: cursors.slice(0, -1) }),
    next: () => { if (current?.page?.nextCursor) setNavigation({ reader, cursors: [...cursors, current.page.nextCursor] }); },
    hasPrevious: cursors.length > 1,
    retry: () => setAttempt(value => value + 1),
  };
}
