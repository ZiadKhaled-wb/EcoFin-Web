import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminCreateShopBody } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Card from '@/components/ui/Card';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import Select from '@/components/ui/Select';
import SubmitButton from '@/components/ui/SubmitButton';
import { t } from '@/i18n';
import { adminApi } from '@/services/shopApi';
import { shopError } from './shopErrors';
export default function CreateShopPage() {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const plans = useQuery({ queryKey: ['admin', 'plans'], queryFn: adminApi.plans });
  const [fields, setFields] = useState({
    name: '',
    slug: '',
    plan: '',
    fullName: '',
    email: '',
    phone: '',
    branch: '',
  });
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const change = (key: keyof typeof fields, value: string) =>
    setFields((previous) => ({ ...previous, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const parsed = AdminCreateShopBody.safeParse({
      name: fields.name,
      tenant_slug: fields.slug,
      plan_key: fields.plan,
      owner: {
        full_name: fields.fullName,
        email: fields.email,
        ...(fields.phone ? { phone: fields.phone } : {}),
      },
      ...(fields.branch ? { branch_name: fields.branch } : {}),
    });
    if (!parsed.success) {
      setInvalid(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.'), t('shops.validation')]),
        ),
      );
      return;
    }
    setInvalid({});
    setSending(true);
    try {
      const result = await adminApi.create(parsed.data);
      await cache.invalidateQueries({ queryKey: ['admin', 'shops'] });
      navigate('/admin', {
        replace: true,
        state: { created: true, emailSent: result.invite_email_sent },
      });
    } catch (failure) {
      setError(shopError(failure));
    } finally {
      setSending(false);
    }
  };
  return (
    <PageContainer>
      <PageHeader
        title={t('shops.newTitle')}
        actions={
          <Link to="/admin" className="btn-link">
            {t('shops.back')}
          </Link>
        }
      />
      <Card className="max-w-3xl">
        <form onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
          <FormField
            label={t('shops.fields.name')}
            required
            value={fields.name}
            onChange={(e) => change('name', e.target.value)}
            error={invalid.name}
          />
          <FormField
            label={t('shops.fields.slug')}
            required
            ltr
            value={fields.slug}
            onChange={(e) => change('slug', e.target.value.toLowerCase())}
            error={invalid.tenant_slug}
          />
          <Select
            label={t('shops.fields.plan')}
            required
            placeholder={t('shops.choosePlan')}
            options={(plans.data ?? []).map((p) => ({ value: p.key, label: p.name }))}
            value={fields.plan}
            onChange={(e) => change('plan', e.target.value)}
            error={invalid.plan_key}
            disabled={plans.isPending}
          />
          <FormField
            label={t('shops.fields.ownerName')}
            required
            value={fields.fullName}
            onChange={(e) => change('fullName', e.target.value)}
            error={invalid['owner.full_name']}
          />
          <FormField
            label={t('shops.fields.email')}
            required
            type="email"
            ltr
            value={fields.email}
            onChange={(e) => change('email', e.target.value)}
            error={invalid['owner.email']}
          />
          <FormField
            label={t('shops.fields.phone')}
            type="tel"
            ltr
            value={fields.phone}
            onChange={(e) => change('phone', e.target.value)}
            error={invalid['owner.phone']}
          />
          <FormField
            label={t('shops.fields.branch')}
            value={fields.branch}
            onChange={(e) => change('branch', e.target.value)}
            error={invalid.branch_name}
          />
          <div className="sm:col-span-2">
            <FormError message={plans.isError ? shopError(plans.error) : error} />
            <SubmitButton
              label={t('shops.create')}
              loadingLabel={t('shops.creating')}
              loading={sending}
              disabled={plans.isPending || plans.isError}
            />
          </div>
        </form>
      </Card>
    </PageContainer>
  );
}
