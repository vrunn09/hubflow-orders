import type { ReactNode } from "react";
import { EmptyState } from "./states";

export function SimpleTable<T>({ rows, cols }: { rows: T[]; cols: [string, (r: T) => ReactNode][] }) {
  if (!rows.length) return <EmptyState title="Nothing here yet" />;
  return (
    <div className="surface overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{cols.map(([h]) => <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody className="divide-y">{rows.map((r, i) => <tr key={i}>{cols.map(([h, f]) => <td key={h} className="px-3 py-2">{f(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
