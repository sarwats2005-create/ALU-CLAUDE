'use client';
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { Button, PageHeader } from '@/components/ui';
import { PartyList } from '@/components/parties/PartyList';

export function CustomersView() {
  const { t } = useApp();
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <PageHeader
        title={t('cust.title')}
        actions={
          <Button size="lg" onClick={() => setAdding(true)} icon={<UserPlus className="h-4 w-4" aria-hidden="true" />}>
            {t('cust.add')}
          </Button>
        }
      />
      <PartyList kind="customer" adding={adding} setAdding={setAdding} />
    </div>
  );
}
