'use client';

import { useEffect, useState } from 'react';
import { Button, Field, PageHeader, Select } from '@/components/form';
import { Card, SectionTitle, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { getPlatformSettings, setPlatformSettings } from '@/lib/api';

export default function PlatformSettingsPage() {
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [region, setRegion] = useState('uae');
  const [currency, setCurrency] = useState('AED');
  const [governance, setGovernance] = useState('autonomous');
  const [expiryDays, setExpiryDays] = useState('365');
  const [supportEmail, setSupportEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPlatformSettings()
      .then((d) => {
        const s = d.settings ?? {};
        setName(d.name);
        setRegion(d.region || 'uae');
        setCurrency(String(s.defaultCurrency ?? 'AED'));
        setGovernance(String(s.defaultGovernanceMode ?? 'autonomous'));
        setExpiryDays(String(s.pointsExpiryDays ?? 365));
        setSupportEmail(String(s.supportEmail ?? ''));
        setLoaded(true);
      })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Failed'));
  }, [toast]);

  async function save() {
    setSaving(true);
    try {
      await setPlatformSettings({
        name,
        region,
        settings: {
          defaultCurrency: currency,
          defaultGovernanceMode: governance,
          pointsExpiryDays: Number(expiryDays) || 0,
          supportEmail,
        },
      });
      toast('success', 'Platform settings saved');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader subtitle="Platform" title="Settings" />
      {!loaded ? (
        <Card className="p-6"><Skeleton className="h-72 w-full" /></Card>
      ) : (
        <div className="max-w-2xl space-y-6">
          <Card className="p-6">
            <SectionTitle>Platform</SectionTitle>
            <div className="space-y-4">
              <Field label="Platform name" value={name} onChange={setName} required />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Home region" value={region} onChange={setRegion} hint="Data-residency home, e.g. uae" />
                <Field label="Support email" value={supportEmail} onChange={setSupportEmail} placeholder="support@partnerspoints.ae" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle>Defaults for new brands</SectionTitle>
            <p className="-mt-2 mb-4 text-sm text-muted-foreground">Applied when onboarding new brands; each brand can still be overridden.</p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Default currency" value={currency} onChange={setCurrency} hint="ISO-4217, e.g. AED" />
                <Field label="Points expiry (days)" value={expiryDays} onChange={setExpiryDays} type="number" hint="0 = never expires" />
              </div>
              <Select
                label="Default governance mode"
                value={governance}
                onChange={setGovernance}
                options={[
                  { value: 'autonomous', label: 'Autonomous — brand edits directly' },
                  { value: 'approval_required', label: 'Approval required — edits queue for review' },
                  { value: 'superadmin_managed', label: 'Platform-managed — brand is read-only' },
                ]}
              />
            </div>
          </Card>

          <div className="flex justify-end"><Button onClick={save} loading={saving}>Save settings</Button></div>
        </div>
      )}
    </div>
  );
}
