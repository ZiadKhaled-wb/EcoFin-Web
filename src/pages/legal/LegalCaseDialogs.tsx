import { useState } from 'react';
import {
  LEGAL_OUTCOME_KINDS,
  compareMoney,
  type LegalCaseDetail,
  type LegalHearing,
  type LegalOutcomeKind,
  type UpdateLegalCaseBody,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import MoneyInput from '@/components/ui/MoneyInput';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { formatBusinessDate, formatMoney } from '@/lib/format';
import { legalApi } from '@/services/legalApi';
import { t } from '@/i18n';
import { claimOf, legalError } from './legalErrors';

/** Every dialog of the case page answers with the whole case; the page replaces it in its cache. */
type Done = (detail: LegalCaseDetail) => void;

/**
 * Closing records how the case ended. It changes nothing on the contract or the customer: a
 * write-off or an early settlement is done by hand with the contract's own screens, and the
 * customer stays blocked until the owner lifts it.
 */
export function CloseCaseDialog({
  legalCase,
  onClose,
  onDone,
}: {
  legalCase: LegalCaseDetail;
  onClose: () => void;
  onDone: Done;
}) {
  const [kind, setKind] = useState<LegalOutcomeKind | ''>('');
  const [outcome, setOutcome] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = kind !== '' && (kind !== 'other' || outcome.trim().length > 0);

  async function close() {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      onDone(
        await legalApi.setStatus(legalCase.id, {
          status: 'closed',
          outcome_kind: kind,
          ...(outcome.trim() ? { outcome: outcome.trim() } : {}),
        }),
      );
    } catch (err) {
      setError(legalError(err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('legal.close.title', { number: legalCase.number })}
      description={t('legal.close.description')}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('legal.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={!ready || busy}
            onClick={() => void close()}
          >
            {t('legal.close.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select
          label={t('legal.close.kind')}
          placeholder={t('legal.close.pick')}
          options={LEGAL_OUTCOME_KINDS.map((k) => ({
            value: k,
            label: t(`legal.outcomeKind.${k}`),
          }))}
          value={kind}
          onChange={(e) => setKind(e.target.value as LegalOutcomeKind | '')}
        />
        <Textarea
          label={kind === 'other' ? t('legal.close.noteRequired') : t('legal.close.note')}
          value={outcome}
          maxLength={1000}
          onChange={(e) => setOutcome(e.target.value)}
        />
        <FormError message={error} />
      </div>
    </Dialog>
  );
}

/** Adds a hearing; a past date is allowed (recording history). */
export function AddHearingDialog({
  legalCase,
  onClose,
  onDone,
}: {
  legalCase: LegalCaseDetail;
  onClose: () => void;
  onDone: Done;
}) {
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function add() {
    if (!date || busy) return;
    setBusy(true);
    setError('');
    try {
      onDone(
        await legalApi.addHearing(legalCase.id, {
          hearing_date: date,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      );
    } catch (err) {
      setError(legalError(err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('legal.hearings.addTitle')}
      description={t('legal.hearings.addDescription')}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('legal.cancel')}
          </Button>
          <Button loading={busy} disabled={!date || busy} onClick={() => void add()}>
            {t('legal.hearings.add')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField
          type="date"
          label={t('legal.hearings.date')}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Textarea
          label={t('legal.hearings.notes')}
          value={notes}
          maxLength={2000}
          onChange={(e) => setNotes(e.target.value)}
        />
        <FormError message={error} />
      </div>
    </Dialog>
  );
}

/** Records what happened at a hearing (and lets the date or the notes be corrected). */
export function HearingOutcomeDialog({
  legalCase,
  hearing,
  onClose,
  onDone,
}: {
  legalCase: LegalCaseDetail;
  hearing: LegalHearing;
  onClose: () => void;
  onDone: Done;
}) {
  const [outcome, setOutcome] = useState(hearing.outcome ?? '');
  const [date, setDate] = useState(hearing.hearing_date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = outcome.trim() !== (hearing.outcome ?? '') || date !== hearing.hearing_date;

  async function save() {
    if (!changed || !date || busy) return;
    setBusy(true);
    setError('');
    try {
      onDone(
        await legalApi.updateHearing(legalCase.id, hearing.id, {
          ...(date !== hearing.hearing_date ? { hearing_date: date } : {}),
          ...(outcome.trim() !== (hearing.outcome ?? '')
            ? { outcome: outcome.trim() === '' ? null : outcome.trim() }
            : {}),
        }),
      );
    } catch (err) {
      setError(legalError(err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('legal.hearings.outcomeTitle', { date: formatBusinessDate(hearing.hearing_date) })}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('legal.cancel')}
          </Button>
          <Button loading={busy} disabled={!changed || !date || busy} onClick={() => void save()}>
            {t('legal.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField
          type="date"
          label={t('legal.hearings.date')}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Textarea
          label={t('legal.hearings.outcome')}
          value={outcome}
          maxLength={500}
          onChange={(e) => setOutcome(e.target.value)}
        />
        <FormError message={error} />
      </div>
    </Dialog>
  );
}

/**
 * The court details. The claim can change only while the case is being prepared and never above
 * what the contract still owes; the lawyer is changed by the owner only.
 */
export function EditDetailsDialog({
  legalCase,
  isOwner,
  lawyers,
  onClose,
  onDone,
}: {
  legalCase: LegalCaseDetail;
  isOwner: boolean;
  lawyers: { id: string; full_name: string }[];
  onClose: () => void;
  onDone: Done;
}) {
  const preparing = legalCase.status === 'preparing';
  const [court, setCourt] = useState(legalCase.court ?? '');
  const [caseType, setCaseType] = useState(legalCase.case_type ?? '');
  const [caseNumber, setCaseNumber] = useState(legalCase.case_number ?? '');
  const [claim, setClaim] = useState(legalCase.claim_amount);
  const [lawyer, setLawyer] = useState(legalCase.lawyer?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Only a claim that was changed is checked: the old one stays valid even if payments since lowered what is left.
  const claimChanged = preparing && claim !== legalCase.claim_amount;
  const claimValue = claimOf(claim);
  const claimAbove =
    claimChanged &&
    claimValue !== null &&
    compareMoney(claimValue, legalCase.amounts.remaining) > 0;
  const claimZero = claimChanged && (claimValue === null || compareMoney(claimValue, '0.00') <= 0);
  const body: UpdateLegalCaseBody = {
    ...(court.trim() !== (legalCase.court ?? '') ? { court: court.trim() || null } : {}),
    ...(caseType.trim() !== (legalCase.case_type ?? '')
      ? { case_type: caseType.trim() || null }
      : {}),
    ...(caseNumber.trim() !== (legalCase.case_number ?? '')
      ? { case_number: caseNumber.trim() || null }
      : {}),
    ...(claimChanged && claimValue !== null ? { claim_amount: claimValue } : {}),
    ...(isOwner && lawyer !== (legalCase.lawyer?.id ?? '')
      ? { lawyer_employee_id: lawyer || null }
      : {}),
  };
  const changed = Object.keys(body).length > 0;
  const ready = changed && !claimAbove && !claimZero;

  async function save() {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      onDone(await legalApi.update(legalCase.id, body));
    } catch (err) {
      setError(legalError(err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('legal.edit.title', { number: legalCase.number })}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('legal.cancel')}
          </Button>
          <Button loading={busy} disabled={!ready || busy} onClick={() => void save()}>
            {t('legal.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {isOwner && (
          <Select
            label={t('legal.fields.lawyer')}
            options={[
              { value: '', label: t('legal.noLawyer') },
              ...lawyers.map((l) => ({ value: l.id, label: l.full_name })),
            ]}
            value={lawyer}
            onChange={(e) => setLawyer(e.target.value)}
          />
        )}
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
          label={t('legal.fields.claim')}
          value={claim}
          disabled={!preparing}
          onValueChange={setClaim}
          help={
            preparing
              ? t('legal.open.claimHelp', { amount: formatMoney(legalCase.amounts.remaining) })
              : t('legal.edit.claimLocked')
          }
          {...(claimAbove
            ? {
                error: t('legal.open.claimTooHigh', {
                  amount: formatMoney(legalCase.amounts.remaining),
                }),
              }
            : {})}
        />
        <FormError message={error} />
      </div>
    </Dialog>
  );
}
