'use client';

import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui';

export interface DiffEntry {
  path: string;
  old: unknown;
  new: unknown;
}

const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function crStatusTone(status: string): 'lime' | 'coral' | 'teal' | 'neutral' {
  return status === 'approved' ? 'lime' : status === 'rejected' ? 'coral' : status === 'pending' ? 'teal' : 'neutral';
}

export function ActionPill({ action }: { action: string }) {
  const tone = action === 'create' ? 'lime' : action === 'delete' ? 'coral' : 'teal';
  return <Badge tone={tone}>{action}</Badge>;
}

/** Side-by-side field-level diff (old → new). */
export function DiffView({ diff }: { diff: DiffEntry[] }) {
  if (!diff?.length) return <p className="py-4 text-sm text-muted-foreground">No field changes.</p>;
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Field</th>
            <th className="px-4 py-2.5 font-semibold">Current</th>
            <th className="px-4 py-2.5 font-semibold">Proposed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {diff.map((d, i) => (
            <tr key={i} className="align-top">
              <td className="px-4 py-2.5 font-mono text-xs font-medium">{d.path}</td>
              <td className="px-4 py-2.5">
                <span className="rounded-lg bg-coral/10 px-2 py-0.5 font-mono text-xs text-[#9b3b52] line-through">{show(d.old)}</span>
              </td>
              <td className="px-4 py-2.5">
                <span className="inline-flex items-center gap-1.5">
                  <ArrowRight size={12} className="text-muted-foreground" />
                  <span className="rounded-lg bg-lime-200/60 px-2 py-0.5 font-mono text-xs text-lime-900">{show(d.new)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
