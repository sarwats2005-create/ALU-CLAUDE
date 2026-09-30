'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, Trash2, UserRound } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { Dialog } from './Dialog';
import { Button, Field, Input, Textarea } from './ui';
import { useToast } from './Toast';

export type PartyKind = 'customer' | 'beneficiary';
export type PartyFormValue = { id?: string; name: string; phone: string; address: string; avatarUrl?: string | null };

/** Crop an image file to a centred 256×256 square (JPEG data URL). */
async function cropSquare(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    return c.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Add / edit a customer or beneficiary. Customers can carry a circular profile picture. */
export function PartyFormDialog({
  kind,
  open,
  onClose,
  initial,
  onSaved,
}: {
  kind: PartyKind;
  open: boolean;
  onClose: () => void;
  initial?: PartyFormValue | null;
  onSaved: (p: { id: string; name: string; phone?: string; balance?: string }) => void;
}) {
  const { t, bump } = useApp();
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined); // undefined = unchanged
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const editing = !!initial?.id;

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setPhone(initial?.phone ?? '');
    setAddress(initial?.address ?? '');
    setAvatar(undefined);
    setPreview(initial?.avatarUrl ?? null);
    setErrors({});
  }, [open, initial]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setErrors((e) => ({ ...e, avatar: t('v.imageTooLarge') }));
      return;
    }
    try {
      const d = await cropSquare(f);
      setAvatar(d);
      setPreview(d);
      setErrors((e) => ({ ...e, avatar: '' }));
    } catch {
      setErrors((e) => ({ ...e, avatar: t('err.generic') }));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErrors({ name: t('v.required') });
      return;
    }
    setBusy(true);
    const base = kind === 'customer' ? '/api/customers' : '/api/beneficiaries';
    const res = await api<{ id: string; name: string; phone?: string; balance?: string }>(editing ? `${base}/${initial!.id}` : base, {
      method: editing ? 'PUT' : 'POST',
      body: { name, phone, address, ...(kind === 'customer' && avatar !== undefined ? { avatar } : {}) },
    });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      if (!res.fieldErrors) toast.error(res.error);
      return;
    }
    toast.success(
      t(kind === 'customer' ? (editing ? 'toast.customerUpdated' : 'toast.customerAdded') : editing ? 'toast.beneficiaryUpdated' : 'toast.beneficiaryAdded'),
    );
    bump();
    onSaved(res.data);
    onClose();
  }

  const title = kind === 'customer' ? t(editing ? 'cust.edit' : 'cust.add') : t(editing ? 'ben.edit' : 'ben.add');
  const fid = `party-${kind}`;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={`${fid}-form`} busy={busy}>
            {editing ? t('common.saveChanges') : title}
          </Button>
        </>
      }
    >
      <form id={`${fid}-form`} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {kind === 'customer' ? (
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-tint text-brand-ink">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="absolute inset-0 m-auto h-9 w-9" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-meta font-medium text-ink">{t('cust.photo')}</p>
              <p className="text-caption text-muted">{t('cust.photoHint')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => file.current?.click()} icon={<Camera className="h-4 w-4" aria-hidden="true" />}>
                  {preview ? t('common.change') : t('common.upload')}
                </Button>
                {preview ? (
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => {
                      setAvatar(null);
                      setPreview(null);
                    }}
                    icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                  >
                    {t('cust.removePhoto')}
                  </Button>
                ) : null}
              </div>
              {errors.avatar ? <p role="alert" className="mt-1 text-meta font-medium text-danger-ink">{errors.avatar}</p> : null}
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
          </div>
        ) : null}
        <Field label={t('common.fullName')} htmlFor={`${fid}-name`} error={errors.name} required>
          <Input id={`${fid}-name`} value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} autoComplete="off" maxLength={120} data-autofocus />
        </Field>
        <Field label={t('common.phone')} htmlFor={`${fid}-phone`} error={errors.phone} optionalLabel={t('common.optional')}>
          <Input id={`${fid}-phone`} type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+964 750 000 0000" autoComplete="off" maxLength={40} />
        </Field>
        <Field label={t('common.address')} htmlFor={`${fid}-address`} error={errors.address} optionalLabel={t('common.optional')}>
          <Textarea id={`${fid}-address`} value={address} onChange={(e) => setAddress(e.target.value)} rows={2} maxLength={300} />
        </Field>
      </form>
    </Dialog>
  );
}

/** Round avatar with initials fallback. */
export function Avatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const ini = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-tint font-bold text-brand-ink" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        ini
      )}
    </span>
  );
}
