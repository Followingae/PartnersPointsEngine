'use client';

import { useEffect, useState } from 'react';
import { Button, Field, PageHeader } from '@/components/form';
import { Card, SectionTitle, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { getSettings, updateSettings, type BrandSettings } from '@/lib/api';

export default function SettingsPage() {
  const toast = useToast();
  const [s, setS] = useState<BrandSettings | null>(null);
  const [name, setName] = useState('');
  const [pointsLabel, setPointsLabel] = useState('');
  const [currency, setCurrency] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#c5f04a');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then((d) => {
        setS(d);
        setName(d.name);
        setPointsLabel(d.pointsCurrencyCode);
        setCurrency(d.currency);
        setLogoUrl(String(d.branding?.logoUrl ?? ''));
        setPrimaryColor(String(d.branding?.primaryColor ?? '#c5f04a'));
      })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'));
  }, [toast]);

  async function save() {
    setSaving(true);
    try {
      await updateSettings({ name, pointsCurrencyCode: pointsLabel, currency, branding: { logoUrl, primaryColor } });
      toast('success', 'Settings saved');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader subtitle="Brand console" title="Settings" />

      {!s ? (
        <Card className="p-6"><Skeleton className="h-64 w-full" /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <SectionTitle>Program</SectionTitle>
              <div className="space-y-4">
                <Field label="Brand name" value={name} onChange={setName} required />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Points label" value={pointsLabel} onChange={setPointsLabel} hint="e.g. PTS, Beans, Stars" />
                  <Field label="Currency" value={currency} onChange={setCurrency} hint="ISO-4217, e.g. AED" />
                </div>
                <Field label="Brand slug" value={s.slug} onChange={() => {}} hint="Immutable — used in URLs & points namespace" />
              </div>
            </Card>

            <Card className="p-6">
              <SectionTitle>Branding</SectionTitle>
              <div className="space-y-4">
                <Field label="Logo URL" value={logoUrl} onChange={setLogoUrl} placeholder="https://…/logo.svg" />
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Primary color</span>
                  <div className="flex items-center gap-3">
                    <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-11 w-14 cursor-pointer rounded-2xl border border-input bg-white" />
                    <Field label="" value={primaryColor} onChange={setPrimaryColor} />
                  </div>
                </label>
              </div>
            </Card>

            <div className="flex justify-end">
              <Button onClick={save} loading={saving}>Save changes</Button>
            </div>
          </div>

          <div>
            <Card className="overflow-hidden">
              <div className="px-6 py-4"><SectionTitle>Preview</SectionTitle></div>
              <div className="px-6 pb-6">
                <div className="rounded-3xl border border-border/70 p-5" style={{ background: `linear-gradient(135deg, ${primaryColor}22, transparent)` }}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl text-ink shadow-hero" style={{ background: primaryColor }}>
                      {logoUrl ? <img src={logoUrl} alt="" className="h-7 w-7 object-contain" /> : <span className="font-display text-lg font-bold">{name.slice(0, 1) || 'B'}</span>}
                    </span>
                    <div>
                      <p className="font-display text-lg font-bold leading-tight">{name || 'Your brand'}</p>
                      <p className="text-xs text-muted-foreground">Earn {pointsLabel || 'PTS'} · {currency || 'AED'}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl bg-white/70 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Available balance</p>
                    <p className="font-display text-2xl font-bold">1,250 <span className="text-sm font-medium text-muted-foreground">{pointsLabel || 'PTS'}</span></p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
