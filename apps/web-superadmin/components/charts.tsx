'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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
