import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  SurveyAlreadyOpenDetail,
  SurveyCreateBody,
  type Survey,
  type SurveyVisitType,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import FormField from '@/components/ui/FormField';
import Notice from '@/components/ui/Notice';
import RadioGroup from '@/components/ui/RadioGroup';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { notify } from '@/components/ui/notify';
import { ApiError } from '@/lib/api';
import { surveysApi } from '@/services/surveysApi';
import { shopToday } from '@/pages/purchasing/purchaseShared';
import { t } from '@/i18n';
import { INSTRUCTIONS_MAX, surveyError, visitTypeLabel } from './surveyShared';
import { useAssigneeOptions } from './useAssigneeOptions';

const VISIT_TYPES: SurveyVisitType[] = ['home', 'work'];

/**
 * R05: a manager (survey.assign) sends an employee to visit the customer. One open survey per
 * customer: SURVEY_ALREADY_OPEN comes back with the open one, which the error links to.
 */
export default function AssignSurveyDialog({
  customer,
  open,
  onOpenChange,
  onDone,
}: {
  customer: { id: string; full_name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (survey: Survey) => void;
}) {
  const assignees = useAssigneeOptions(open);
  const [assignee, setAssignee] = useState('');
  const [visitType, setVisitType] = useState<SurveyVisitType>('home');
  const [dueDate, setDueDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState('');
  const [openSurveyId, setOpenSurveyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const today = shopToday();

  async function save() {
    setError('');
    setOpenSurveyId(null);
    const parsed = SurveyCreateBody.safeParse({
      customer_id: customer.id,
      assigned_to: assignee,
      visit_type: visitType,
      due_date: dueDate === '' ? null : dueDate,
      instructions,
    });
    if (!parsed.success || (dueDate !== '' && dueDate < today)) {
      setError(t('surveys.errors.VALIDATION_FAILED'));
      return;
    }
    setSaving(true);
    try {
      const survey = await surveysApi.assign(parsed.data);
      notify.success(t('surveys.assign.done'));
      onDone(survey);
      onOpenChange(false);
    } catch (err) {
      setError(surveyError(err));
      if (err instanceof ApiError && err.code === 'SURVEY_ALREADY_OPEN') {
        const detail = SurveyAlreadyOpenDetail.safeParse(err.details);
        if (detail.success) setOpenSurveyId(detail.data.survey_id);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('surveys.assign.title')}
      description={t('surveys.assign.description', { name: customer.full_name })}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-4"
        noValidate
      >
        {assignees.selfOnly && <Notice tone="info">{t('surveys.assign.selfOnly')}</Notice>}
        {assignees.failed && <Notice tone="error">{t('surveys.assign.assigneesFailed')}</Notice>}
        <Select
          label={t('surveys.assign.assignee')}
          placeholder={t('surveys.assign.assigneePlaceholder')}
          help={t('surveys.assign.assigneeHelp')}
          options={assignees.options}
          value={assignee}
          required
          disabled={assignees.loading}
          onChange={(e) => setAssignee(e.target.value)}
        />
        <RadioGroup
          label={t('surveys.visitType.label')}
          name="visit_type"
          orientation="horizontal"
          options={VISIT_TYPES.map((v) => ({ value: v, label: visitTypeLabel(v) }))}
          value={visitType}
          onChange={(v) => setVisitType(v as SurveyVisitType)}
        />
        <FormField
          label={t('surveys.assign.dueDate')}
          help={t('settings.optional')}
          type="date"
          min={today}
          value={dueDate}
          ltr
          onChange={(e) => setDueDate(e.target.value)}
        />
        <Textarea
          label={t('surveys.assign.instructions')}
          help={t('surveys.assign.instructionsHelp')}
          maxLength={INSTRUCTIONS_MAX}
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
        <FormError message={error} />
        {openSurveyId && (
          <Link to={`/customers/surveys/${openSurveyId}`} className="btn btn-secondary btn-sm">
            {t('surveys.assign.openExisting')}
          </Link>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving || assignee === ''}>
            {t('surveys.assign.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('surveys.assign.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
