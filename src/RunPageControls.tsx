export function RunPageControls({ page, total, hasPrevious, hasNext, loading, onPrevious, onNext }: {
  page: number; total?: number; hasPrevious: boolean; hasNext: boolean; loading: boolean; onPrevious: () => void; onNext: () => void;
}) {
  return <div className="list-pagination">
    <button type="button" disabled={!hasPrevious || loading} onClick={onPrevious}>Previous</button>
    <span>{total === undefined ? 'Loading saved records…' : `${total.toLocaleString()} records · page ${page}`}</span>
    <button type="button" disabled={!hasNext || loading} onClick={onNext}>Next</button>
  </div>;
}
