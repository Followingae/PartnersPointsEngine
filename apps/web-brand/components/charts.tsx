'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const LINE_COLORS = ['#9bbe1e', '#5ba8fb', '#ff6fa5', '#3bb0a8', '#ffab3d', '#b07cf0'];

const SEGMENT_COLORS: Record<string, string> = {
  champions: '#9bbe1e',
  loyal: '#cbe84a',
  potential_loyalist: '#7eead4',
  new: '#5ba8fb',
  at_risk: '#ff8a7a',
  cant_lose: '#ff6fa5',
  hibernating: '#b9a7c9',
  regular: '#cfcfca',
};

export function TrendChart({ data }: { data: { date: string; earned: number; redeemed: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="earned" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9bbe1e" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#9bbe1e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#ececec" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11, fill: '#9a9a95' }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#9a9a95' }} tickLine={false} axisLine={false} width={48} />
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eee', fontSize: 12 }} />
        <Area type="monotone" dataKey="earned" stroke="#9bbe1e" strokeWidth={3} fill="url(#earned)" />
        <Area type="monotone" dataKey="redeemed" stroke="#ff6fa5" strokeWidth={2.5} fillOpacity={0} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Dashboard points-activity chart with selectable series (earned / redeemed / net). */
export function ActivityChart({ data, mode }: { data: { date: string; earned: number; redeemed: number; net: number }[]; mode: 'both' | 'earned' | 'redeemed' | 'net' }) {
  const show = (k: string) => mode === 'both' ? k !== 'net' : mode === k;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="ac-earned" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9bbe1e" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#9bbe1e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="ac-redeemed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff6fa5" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#ff6fa5" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="ac-net" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3bb0a8" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#3bb0a8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#ececec" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11, fill: '#9a9a95' }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#9a9a95' }} tickLine={false} axisLine={false} width={48} />
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eee', fontSize: 12 }} />
        {show('earned') ? <Area type="monotone" dataKey="earned" name="Earned" stroke="#9bbe1e" strokeWidth={3} fill="url(#ac-earned)" /> : null}
        {show('redeemed') ? <Area type="monotone" dataKey="redeemed" name="Redeemed" stroke="#ff6fa5" strokeWidth={2.5} fill={mode === 'redeemed' ? 'url(#ac-redeemed)' : 'transparent'} fillOpacity={mode === 'redeemed' ? 1 : 0} /> : null}
        {show('net') ? <Area type="monotone" dataKey="net" name="Net" stroke="#3bb0a8" strokeWidth={3} fill="url(#ac-net)" /> : null}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Segment distribution as a donut with a labelled legend — replaces the cramped angled bars. */
export function SegmentDonut({ data }: { data: { segment: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="segment" cx="50%" cy="50%" innerRadius={56} outerRadius={84} paddingAngle={2} stroke="none">
              {data.map((d) => (
                <Cell key={d.segment} fill={SEGMENT_COLORS[d.segment] ?? '#cfcfca'} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eee', fontSize: 12 }} formatter={(v: number, n: string) => [`${v} members`, n.replace(/_/g, ' ')]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold leading-none">{total}</span>
          <span className="text-[11px] text-muted-foreground">members</span>
        </div>
      </div>
      <ul className="grid w-full grid-cols-2 gap-x-3 gap-y-1.5">
        {data.map((d) => (
          <li key={d.segment} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEGMENT_COLORS[d.segment] ?? '#cfcfca' }} />
            <span className="flex-1 truncate capitalize text-muted-foreground">{d.segment.replace(/_/g, ' ')}</span>
            <span className="font-semibold tabular-nums">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Generic categorical bar chart (histograms, distributions, branch breakdowns). */
export function CategoryBars({ data, color = '#9bbe1e', height = 240, angle = 0 }: { data: { label: string; value: number }[]; color?: string; height?: number; angle?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: angle ? 28 : 0 }}>
        <CartesianGrid stroke="#ececec" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9a9a95' }} tickLine={false} axisLine={false} interval={0} angle={angle ? -angle : 0} textAnchor={angle ? 'end' : 'middle'} height={angle ? 50 : 24} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9a9a95' }} tickLine={false} axisLine={false} width={40} />
        <Tooltip cursor={{ fill: '#f4f4f1' }} contentStyle={{ borderRadius: 12, border: '1px solid #eee', fontSize: 12 }} />
        <Bar dataKey="value" radius={[8, 8, 0, 0]} fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Cohort retention curves — one line per cohort, x = months since signup. */
export function RetentionLines({ cohorts, offsets }: { cohorts: { cohort: string; retention: (number | null)[] }[]; offsets: number }) {
  const data = Array.from({ length: offsets }, (_, i) => {
    const row: Record<string, number | string | null> = { month: `M${i}` };
    for (const c of cohorts) row[c.cohort] = c.retention[i];
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="#ececec" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9a9a95' }} tickLine={false} axisLine={false} />
        <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: '#9a9a95' }} tickLine={false} axisLine={false} width={44} />
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #eee', fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {cohorts.map((c, i) => (
          <Line key={c.cohort} type="monotone" dataKey={c.cohort} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2.5} connectNulls dot={{ r: 3 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SegmentBars({ data }: { data: { segment: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#ececec" vertical={false} />
        <XAxis dataKey="segment" tickFormatter={(s: string) => s.replace(/_/g, ' ')} tick={{ fontSize: 10, fill: '#9a9a95' }} tickLine={false} axisLine={false} interval={0} angle={-12} textAnchor="end" height={50} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9a9a95' }} tickLine={false} axisLine={false} width={36} />
        <Tooltip cursor={{ fill: '#f4f4f1' }} contentStyle={{ borderRadius: 12, border: '1px solid #eee', fontSize: 12 }} />
        <Bar dataKey="count" radius={[8, 8, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.segment} fill={SEGMENT_COLORS[d.segment] ?? '#cfcfca'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
