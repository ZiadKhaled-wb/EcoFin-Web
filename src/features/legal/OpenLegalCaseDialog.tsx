import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { compareMoney, type OpenLegalCaseBody } from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import MoneyInput from '@/components/ui/MoneyInput';
import Notice from '@/components/ui/Notice';
import Select from '@/components/ui/Select';
import Skeleton from '@/components/ui/Skeleton';
import Textarea from '@/components/ui/Textarea';
import { useShopModules } from '@/features/subscription/useShopModules';
import { formatMoney } from '@/lib/format';
import { claimOf, legalError, openCaseIdOf } from '@/pages/legal/legalErrors';
import { installmentKeys, installmentsApi } from '@/services/installmentsApi';
import { legalApi, legalKeys } from '@/services/legalApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

/**
 * L01 (D92): "Open legal case" on N04's legal referrals and on the contract page. Only the owner
 * opens a case, and only in a shop whose plan has the legal module. Nothing here adds to what the
 * customer owes: the claim is at most what the contract still owes, and court costs are never part
 * of it (Islamic finance rule 4).
 */
export function OpenLegalCaseButton({
  contractId,
  contractNumber,
  size = 'sm',
}: {
  contractId: string;
  contractNumber: string;
  size?: 'sm' | 'md';
}) {
  const isOwner = useAuthStore((s) => s.user?.role === 'OWNER');
  const modules = useShopModules();
  const [open, setOpen] = useState(false);
  if (!isOwner || (modules && !modules.includes('legal'))) return null;
  return (
    <>
      <Button
        size={size}
        variant="secondary"
        className="whitespace-nowrap"
        onClick={() => setOpen(true)}
      >
        {t('legal.open.button')}
      </Button>
      {open && (
        <OpenLegalCaseDialog
          contractId={contractId}
          contractNumber={contractNumber}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export default function OpenLegalCaseDialog({
  contractId,
  contractNumber,
  onClose,
}: {
  contractId: string;
  contractNumber: string;
  onClose: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const navigate = useNavigate();
  const cache = useQueryClient();
  // One key per dialog: a second click is the same case, not a new one.
  const key = useRef(crypto.randomUUID());
  const contract = useQuery({
    queryKey: installmentKeys.contract(orgId, contractId),
    queryFn: () => installmentsApi.contract(contractId),
    retry: false,
  });
  const lawyers = useQuery({ queryKey: legalKeys.lawyers(orgId), queryFn: legalApi.lawyers });
  const remaining = contract.data?.balance.remaining ?? null;

  const [lawyer, setLawyer] = useState('');
  const [court, setCourt] = useState('');
  const [caseType, setCaseType] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [claim, setClaim] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState<string | null>(null);

  // The claim starts at what the contract still owes (the server's default) until the owner types.
  const claimText = claim ?? remaining ?? '';
  const claimValue = claimOf(claimText);
  const claimAbove =
    remaining !== null && claimValue !== null && compareMoney(claimValue, remaining) > 0;
  const claimZero =
    claimText !== '' && claimValue !== null && compareMoney(claimValue, '0.00') <= 0;
  const ready = remaining !== null && claimValue !== null && !claimAbove && !claimZero;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    setExisting(null);
    const body: OpenLegalCaseBody = {
      contract_id: contractId,
      ...(lawyer ? { lawyer_employee_id: lawyer } : {}),
      ...(court.trim() ? { court: court.trim() } : {}),
      ...(caseType.trim() ? { case_type: caseType.trim() } : {}),
      ...(caseNumber.trim() ? { case_number: caseNumber.trim() } : {}),
      claim_amount: claimValue ?? claimText,
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    try {
      const opened = await legalApi.open(body, key.current);
      cache.setQueryData(legalKeys.detail(orgId, opened.id), opened);
      void cache.invalidateQueries({ queryKey: legalKeys.all(orgId) });
      void cache.invalidateQueries({ queryKey: ['overdue', orgId] });
      void cache.invalidateQueries({ queryKey: installmentKeys.contract(orgId, contractId) });
      navigate(`/legal/cases/${opened.id}`);
    } catch (err) {
      setExisting(openCaseIdOf(err));
      setError(legalError(err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('legal.open.title', { number: contractNumber })}
      description={t('legal.open.description')}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('legal.cancel')}
          </Button>
          <Button loading={busy} disabled={!ready || busy} onClick={() => void submit()}>
            {t('legal.open.confirm')}
          </Button>
        </>
      }
    >
      {contract.isPending ? (
        <Skeleton className="h-40" />
      ) : contract.isError ? (
        <Notice tone="error">{t('legal.errors.CONTRACT_NOT_FOUND')}</Notice>
      ) : (
        <div className="space-y-3">
          <Select
            label={t('legal.open.lawyer')}
            options={[
              { value: '', label: t('legal.open.noLawyer') },
              ...(lawyers.data?.items ?? []).map((l) => ({ value: l.id, label: l.full_name })),
            ]}
            value={lawyer}
            onChange={(e) => setLawyer(e.target.value)}
            help={t('legal.open.lawyerHelp')}
          />
          <FormField
            label={t('legal.fields.court')}
            value={court}
            maxLength={200}
            onChange={(e) => setCourt(e.target.value)}
          />
          <FormField
            label={t('legal.fields.caseType')}
            value={caseType}
            maxLength={100}
            onChange={(e) => setCaseType(e.target.value)}
          />
          <FormField
            label={t('legal.fields.caseNumber')}
            value={caseNumber}
            maxLength={100}
            onChange={(e) => setCaseNumber(e.target.value)}
          />
          <MoneyInput
            label={t('legal.open.claim')}
            value={claimText}
            onValueChange={setClaim}
            help={t('legal.open.claimHelp', { amount: formatMoney(remaining ?? '0.00') })}
            {...(claimAbove || claimZero
              ? {
                  error: claimAbove
                    ? t('legal.open.claimTooHigh', { amount: formatMoney(remaining ?? '0.00') })
                    : t('legal.open.claimZero'),
                }
              : {})}
          />
          <Textarea
            label={t('legal.open.note')}
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="type-caption">{t('legal.open.blockNotice')}</p>
          <FormError message={error} />
          {existing && (
            <Link className="link" to={`/legal/cases/${existing}`} onClick={onClose}>
              {t('legal.open.viewExisting')}
            </Link>
          )}
        </div>
      )}
    </Dialog>
  );
}
