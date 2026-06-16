'use client';

import { Mail, MessageSquare, Pencil, Plus, Smartphone, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, PageHeader, Select, Textarea } from '@/components/form';
import { ActionMenu, Badge, Card, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';
import { createTemplate, deleteTemplate, getTemplateVariables, getTemplates, previewTemplate, updateTemplate, type TemplateRow } from '@/lib/api';

const CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'push', label: 'Push' },
];
const CHANNEL_ICON: Record<string, React.ReactNode> = { email: <Mail size={16} />, sms: <MessageSquare size={16} />, push: <Smartphone size={16} /> };

export default function MessagingPage() {
  const toast = useToast();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TemplateRow | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<TemplateRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getTemplates().then((r) => setRows(r.rows)).catch((e) => toast('error', e instanceof Error ? e.message : 'Failed')).finally(() => setLoading(false));
  }, [toast]);
  useEffect(() => load(), [load]);

  async function onDelete() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteTemplate(toDelete.id);
      toast('success', `Deleted “${toDelete.name}”`);
      setToDelete(null);
      load();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader subtitle="Brand console" title="Messaging templates" action={<Button onClick={() => setEditing('new')}><Plus size={16} /> New template</Button>} />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : rows.length === 0 ? (
        <Card className="p-5"><EmptyState icon={<Mail size={22} />} title="No templates yet" hint="Create email / SMS / push templates with variables like {{customer_name}}." action={<Button onClick={() => setEditing('new')}><Plus size={16} /> New template</Button>} /></Card>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex items-start justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-teal text-ink">{CHANNEL_ICON[t.channel]}</span>
                <div className="flex items-center gap-2">
                  <Badge tone={t.enabled ? 'lime' : 'neutral'}>{t.enabled ? 'on' : 'off'}</Badge>
                  <ActionMenu actions={[
                    { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditing(t) },
                    { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => setToDelete(t) },
                  ]} />
                </div>
              </div>
              <h3 className="mt-3 font-display text-lg font-semibold">{t.name}</h3>
              <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{t.channel}{t.event ? ` · ${t.event}` : ''}</p>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{t.subject || t.body}</p>
            </Card>
          ))}
        </section>
      )}

      {editing ? <TemplateEditor template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} /> : null}
      <ConfirmDialog open={toDelete !== null} onClose={() => setToDelete(null)} onConfirm={onDelete} loading={busy} title="Delete template?" message={`“${toDelete?.name}” will be removed.`} />
    </div>
  );
}

function TemplateEditor({ template, onClose, onSaved }: { template: TemplateRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(template?.name ?? '');
  const [channel, setChannel] = useState(template?.channel ?? 'email');
  const [event, setEvent] = useState(template?.event ?? '');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [body, setBody] = useState(template?.body ?? 'Hi {{customer_name}}, you have {{points_balance}} points with {{brand_name}}.');
  const [vars, setVars] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { getTemplateVariables().then((v) => setVars(v.variables)).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => { previewTemplate({ subject, body }).then(setPreview).catch(() => {}); }, 300);
    return () => clearTimeout(t);
  }, [subject, body]);

  function insertVar(v: string) { setBody((b) => `${b}{{${v}}}`); }

  async function submit() {
    if (!name.trim()) { setErrors({ name: 'Name is required' }); return; }
    setSaving(true);
    try {
      if (template) await updateTemplate(template.id, { name, channel, event: event || undefined, subject: subject || undefined, body });
      else await createTemplate({ name, channel, event: event || undefined, subject: subject || undefined, body });
      toast('success', template ? 'Template updated' : 'Template created');
      onSaved();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={template ? 'Edit template' : 'New template'} subtitle="Use {{variables}} — preview renders with sample data">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Name" value={name} onChange={setName} placeholder="e.g. Points earned receipt" required error={errors.name} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Channel" value={channel} onChange={setChannel} options={CHANNELS} />
            <Field label="Trigger event" value={event} onChange={setEvent} placeholder="earn, redeem, tier_up…" />
          </div>
          {channel === 'email' ? <Field label="Subject" value={subject} onChange={setSubject} placeholder="You earned points!" /> : null}
          <Textarea label="Body" value={body} onChange={setBody} rows={6} />
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Insert variable</p>
            <div className="flex flex-wrap gap-1.5">
              {vars.map((v) => (
                <button key={v} onClick={() => insertVar(v)} className="rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] transition hover:bg-secondary">{`{{${v}}}`}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Preview</p>
          <div className="rounded-3xl border border-border/70 bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="grid h-7 w-7 place-items-center rounded-full bg-card">{CHANNEL_ICON[channel]}</span> {channel.toUpperCase()} preview</div>
            {channel === 'email' && preview?.subject ? <p className="mt-3 font-semibold">{preview.subject}</p> : null}
            <p className="mt-2 whitespace-pre-wrap text-sm">{preview?.body ?? body}</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} loading={saving}>{template ? 'Save' : 'Create'}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
