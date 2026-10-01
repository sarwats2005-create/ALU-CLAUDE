'use client';
import { useCallback } from 'react';
import { useApp } from '@/lib/client/app-context';
import { autoSaveInvoice } from '@/lib/client/invoice-folder';
import { useToast } from './Toast';

/** After an invoice is created or edited: save <number>.pdf to the auto-save folder (when one is chosen). */
export function useInvoiceAutoSave() {
  const { t } = useApp();
  const toast = useToast();
  return useCallback(
    (id: string, number: string) => {
      void autoSaveInvoice(id, number).then((r) => {
        if (r.status === 'saved') toast.success(t('invc.saved', { file: r.file, name: r.folder }));
        else if (r.status === 'pending') toast.error(t('invc.saveFailed', { file: r.file }));
      });
    },
    [t, toast],
  );
}
