'use client';

import { useEffect, useState } from 'react';
import { Button, Field, PageHeader } from '@/components/form';
import { Card, SectionTitle, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { getSettings, updateSettings, type BrandSettings } from '@/lib/api';

const EMPTY_PROFILE = { description: '', address: '', city: '', website: '', publicPhone: '', instagram: '', facebook: '', tiktok: '', x: '' };
type Profile = typeof EMPTY_PROFILE;

export default function SettingsPage() {
  const toast = useToast();
  const [s, setS] = useState<BrandSettings | null>(null);
  const [name, setName] = useState('');
  const [pointsLabel, setPointsLabel] = useState('');
  const [currency, setCurrency] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#c5f04a');
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);

  const setField = (k: keyof Profile) => (v: string) => setProfile((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    getSettings()
      .then((d) => {
        setS(d);
        setName(d.name);
        setPointsLabel(d.pointsCurrencyCode);
        setCurrency(d.currency);
        const b = (d.branding ?? {}) as Record<string, unknown>;
        setLogoUrl(String(b.logoUrl ?? ''));
        setPrimaryColor(String(b.primaryColor ?? '#c5f04a'));
        setProfile({ ...EMPTY_PROFILE, ...Object.fromEntries(Object.keys(EMPTY_PROFILE).map((k) => [k, String(b[k] ?? '')])) } as Profile);
      })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'));
  }, [toast]);

  async function save() {
    setSaving(true);
    try {
      await updateSettings({ name, pointsCurrencyCode: pointsLabel, currency, branding: { logoUrl, primaryColor, ...profile } });
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
          <div className="space-y-6 lg:col-span-2">
            <Card className="p-6">
              <SectionTitle>Program</SectionTitle>
              <div className="space-y-4">
                <Field label="Brand name" value={name} onChange={setName} required />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Points label" value={pointsLabel} onChange={setPointsLabel} hint="e.g. PTS, Beans, Stars" />
                  <Field label="Currency" value={currency} onChange={setCurrency} hint="ISO-4217, e.g. AED" />
                </div>
                <Field label="Brand slug" value={s.slug} onChange={() => {}} hint="Immutable — used in URLs & points namespace" />
              </div>
            </Card>

            <Card className="p-6">
              <SectionTitle>Branding</SectionTitle>
              <div className="space-y-4">
                <Field label="Logo URL" value={logoUrl} onChange={setLogoUrl} placeholder="https://…/logo.png" hint="Shown in the customer mobile app and emails." />
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Primary color</span>
                  <div className="flex items-center gap-3">
                    <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-11 w-14 cursor-pointer rounded-2xl border border-input bg-white" />
                    <Field label="" value={primaryColor} onChange={setPrimaryColor} />
                  </div>
                </label>
              </div>
            </Card>

            <Card className="p-6">
              <SectionTitle>Public profile</SectionTitle>
              <p className="-mt-2 mb-4 text-sm text-muted-foreground">Shown to customers in the mobile app — your storefront details and links.</p>
              <div className="space-y-4">
                <Field label="Short description" value={profile.description} onChange={setField('description')} placeholder="Specialty coffee roastery in Dubai." hint="One line customers see under your name." />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Address" value={profile.address} onChange={setField('address')} placeholder="Unit 4, Al Quoz" />
                  <Field label="City" value={profile.city} onChange={setField('city')} placeholder="Dubai" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Website" value={profile.website} onChange={setField('website')} placeholder="https://yourbrand.com" />
                  <Field label="Public phone" value={profile.publicPhone} onChange={setField('publicPhone')} placeholder="+971 4 000 0000" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Instagram" value={profile.instagram} onChange={setField('instagram')} placeholder="@yourbrand" />
                  <Field label="Facebook" value={profile.facebook} onChange={setField('facebook')} placeholder="facebook.com/yourbrand" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="TikTok" value={profile.tiktok} onChange={setField('tiktok')} placeholder="@yourbrand" />
                  <Field label="X (Twitter)" value={profile.x} onChange={setField('x')} placeholder="@yourbrand" />
                </div>
              </div>
            </Card>

            <div className="flex justify-end">
              <Button onClick={save} loading={saving}>Save changes</Button>
            </div>
          </div>

          <div>
            <Card className="overflow-hidden">
              <div className="px-6 py-4"><SectionTitle>Mobile app preview</SectionTitle></div>
              <div className="px-6 pb-6">
                <div className="rounded-3xl border border-border/70 p-5" style={{ background: `linear-gradient(135deg, ${primaryColor}22, transparent)` }}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl text-ink shadow-hero" style={{ background: primaryColor }}>
                      {logoUrl ? <img src={logoUrl} alt="" className="h-7 w-7 object-contain" /> : <span className="font-display text-lg font-bold">{name.slice(0, 1) || 'B'}</span>}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-bold leading-tight">{name || 'Your brand'}</p>
                      <p className="truncate text-xs text-muted-foreground">{profile.description || `Earn ${pointsLabel || 'PTS'} · ${currency || 'AED'}`}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl bg-white/70 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Available balance</p>
                    <p className="font-display text-2xl font-bold">1,250 <span className="text-sm font-medium text-muted-foreground">{pointsLabel || 'PTS'}</span></p>
                  </div>
                  {(profile.address || profile.website || profile.instagram) ? (
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {profile.address ? <p>📍 {profile.address}{profile.city ? `, ${profile.city}` : ''}</p> : null}
                      {profile.website ? <p>🌐 {profile.website.replace(/^https?:\/\//, '')}</p> : null}
                      {profile.instagram ? <p>📷 {profile.instagram}</p> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
