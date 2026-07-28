'use client';

import { Megaphone, ReceiptText } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, Field, PageHeader } from '@/components/form';
import { Badge, Card, SectionTitle, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import {
  getPlatformSettings, getReceiptStats, setPlatformSettings,
  type EReceiptAd, type ReceiptStats,
} from '@/lib/api';

/**
 * eReceipts — the hosted pages behind every printed till-receipt QR.
 * Superadmin owns the ad slot shown on all of them and sees engagement here.
 */
export default function EReceiptsPage() {
  const toast = useToast();
  const [stats, setStats] = useState<ReceiptStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [ad, setAd] = useState<EReceiptAd | null>(null);
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getReceiptStats(), getPlatformSettings()])
      .then(([s, p]) => {
        setStats(s);
        const a = ((p.settings ?? {}) as { eReceiptAd?: EReceiptAd }).eReceiptAd ?? {};
        setAd(a);
        setHeadline(a.headline ?? '');
        setBody(a.body ?? '');
        setCtaLabel(a.ctaLabel ?? '');
        setCtaUrl(a.ctaUrl ?? '');
        setImageUrl(a.imageUrl ?? '');
      })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function saveAd(enabledOverride?: boolean) {
    setSaving(true);
    try {
      const next: EReceiptAd = {
        enabled: enabledOverride ?? ad?.enabled ?? false,
        headline: headline.trim() || undefined,
        body: body.trim() || undefined,
        ctaLabel: ctaLabel.trim() || undefined,
        ctaUrl: ctaUrl.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
      };
      await setPlatformSettings({ settings: { eReceiptAd: next } });
      setAd(next);
      toast('success', next.enabled ? 'Ad live on all eReceipts' : 'Ad saved (disabled)');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  const t = stats?.total;

  return (
    <div>
      <PageHeader subtitle="Platform" title="eReceipts" />

      {/* engagement */}
      {loading || !t ? (
        <Card className="p-6"><Skeleton className="h-24 w-full" /></Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Receipts issued" value={t.receipts.toLocaleString()} />
          <Stat label="Scan-through" value={`${t.scanRate}%`} hint={`${t.viewed.toLocaleString()} opened`} />
          <Stat label="Total views" value={t.views.toLocaleString()} />
          <Stat label="Ad clicks" value={t.adClicks.toLocaleString()} tone={t.adClicks > 0 ? 'lime' : undefined} />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ad manager */}
        <Card className="p-5">
          <div className="mb-1 flex items-center justify-between">
            <SectionTitle>Receipt ad</SectionTitle>
            {ad ? (
              <button disabled={saving} onClick={() => saveAd(!(ad.enabled ?? false))} title="Toggle the ad on every eReceipt">
                <Badge tone={ad.enabled ? 'lime' : 'neutral'}>{ad.enabled ? 'Live' : 'Off'}</Badge>
              </button>
            ) : null}
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Shown on every eReceipt across all brands. Clicks are tracked above.
          </p>
          <div className="space-y-3">
            <Field label="Headline" value={headline} onChange={setHeadline} placeholder="Weekend double points at Camel Bean" />
            <Field label="Body (optional)" value={body} onChange={setBody} placeholder="Sat–Sun, all branches" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Button label" value={ctaLabel} onChange={setCtaLabel} placeholder="See offers" />
              <Field label="Button link" value={ctaUrl} onChange={setCtaUrl} placeholder="https://…" />
            </div>
            <Field label="Image URL (optional)" value={imageUrl} onChange={setImageUrl} placeholder="https://… (wide, ≥800px)" hint="Shown above the headline" />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => saveAd(false)} loading={saving}>Save draft</Button>
            <Button onClick={() => saveAd(true)} loading={saving}><Megaphone size={14} /> Publish</Button>
          </div>
        </Card>

        {/* live preview */}
        <Card className="p-5">
          <SectionTitle>Preview</SectionTitle>
          <p className="mb-4 text-sm text-muted-foreground">How the ad renders at the bottom of an eReceipt.</p>
          <div className="mx-auto max-w-[340px] rounded-3xl border border-border/70 bg-[#FBFAF7] p-4">
            <div className="rounded-2xl border border-border/70 bg-white p-4 text-center text-xs text-muted-foreground">
              <ReceiptText size={16} className="mx-auto mb-1" /> transaction summary
            </div>
            <div className="mt-3 overflow-hidden rounded-2xl border border-border/70 bg-white">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="max-h-28 w-full object-cover" />
              ) : null}
              <div className="p-4">
                <p className="text-sm font-bold">{headline || 'Your headline here'}</p>
                {body ? <p className="mt-0.5 text-xs text-muted-foreground">{body}</p> : null}
                <span className="mt-2 inline-block rounded-full bg-lime-400 px-3 py-1 text-xs font-bold text-ink">
                  {ctaLabel || 'Learn more'}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* per-brand table */}
      <Card className="mt-6 p-5">
        <SectionTitle>By brand</SectionTitle>
        {loading || !stats ? (
          <Skeleton className="h-32 w-full" />
        ) : stats.brands.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No eReceipts yet — they appear as terminals print.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Brand</th>
                  <th className="px-4 py-3">Receipts</th>
                  <th className="px-4 py-3">Scan-through</th>
                  <th className="px-4 py-3">Views</th>
                  <th className="px-4 py-3">Ad clicks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {stats.brands.map((b) => (
                  <tr key={b.brandId} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{b.brandName}</td>
                    <td className="px-4 py-3">{b.receipts.toLocaleString()}</td>
                    <td className="px-4 py-3"><Badge tone={b.scanRate >= 25 ? 'lime' : 'neutral'}>{b.scanRate}%</Badge></td>
                    <td className="px-4 py-3">{b.views.toLocaleString()}</td>
                    <td className="px-4 py-3">{b.adClicks.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'lime' }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-display text-3xl font-bold tracking-tight ${tone === 'lime' ? 'text-lime-600' : ''}`}>{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}
