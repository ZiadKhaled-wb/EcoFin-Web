import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  OpenWarrantyClaimBody,
  type WarrantyLine,
  type WarrantyClaimOpened,
} from '@ziadkhaled-wb/contracts';
import Dialog from '@/components/ui/Dialog';
import Textarea from '@/components/ui/Textarea';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import Button from '@/components/ui/Button';
import { warrantyApi, warrantyKeys } from '@/services/warrantyApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
// Mounted fresh per opening: one key and a saved claim/photo cursor survive an upload retry.
export default function OpenWarrantyClaimDialog({
  line,
  onClose,
}: {
  line: WarrantyLine;
  onClose: () => void;
}) {
  const navigate = useNavigate(),
    client = useQueryClient(),
    org = useAuthStore((s) => s.orgId);
  const [key] = useState(() => crypto.randomUUID());
  const [issue, setIssue] = useState(''),
    [condition, setCondition] = useState(''),
    [photos, setPhotos] = useState<File[]>([]),
    [invalid, setInvalid] = useState(false);
  const created = useRef<WarrantyClaimOpened | null>(null),
    uploaded = useRef(0);
  const latestUnit = line.chain.at(-1)?.unit_id;
  const mutation = useMutation({
    mutationFn: async () => {
      created.current ??= await warrantyApi.open(
        OpenWarrantyClaimBody.parse({
          sale_line_id: line.sale_line_id,
          ...(latestUnit ? { unit_id: latestUnit } : {}),
          issue,
          condition,
        }),
        key,
      );
      for (; uploaded.current < photos.length; uploaded.current++)
        await warrantyApi.uploadPhoto(created.current.claim_id, photos[uploaded.current]!);
      return created.current;
    },
    onSuccess: async (c) => {
      await client.invalidateQueries({ queryKey: warrantyKeys.all(org) });
      navigate('/warranty/claims/' + c.claim_id);
      onClose();
    },
  });
  const disabled = mutation.isPending || !!created.current;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) {
          if (created.current) navigate('/warranty/claims/' + created.current.claim_id);
          onClose();
        }
      }}
      title={t('sales.warranty.open')}
      description={line.product.name}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = OpenWarrantyClaimBody.safeParse({
            sale_line_id: line.sale_line_id,
            issue,
            condition,
          });
          setInvalid(!parsed.success || photos.length > 5);
          if (parsed.success && photos.length <= 5 && !mutation.isPending) mutation.mutate();
        }}
      >
        <Textarea
          label={t('sales.warranty.issue')}
          value={issue}
          maxLength={500}
          disabled={disabled}
          onChange={(e) => setIssue(e.target.value)}
        />
        <Textarea
          label={t('sales.warranty.condition')}
          value={condition}
          maxLength={300}
          disabled={disabled}
          onChange={(e) => setCondition(e.target.value)}
        />
        <FormField
          type="file"
          label={t('sales.warranty.photos')}
          help={t('sales.warranty.photoLimit')}
          accept="image/png,image/jpeg,image/webp"
          multiple
          disabled={disabled}
          onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
        />
        <FormError
          message={
            invalid
              ? t('sales.warranty.invalid')
              : mutation.isError
                ? t('sales.warranty.openFailed')
                : ''
          }
        />
        <Button type="submit" loading={mutation.isPending} disabled={mutation.isPending}>
          {t(created.current ? 'sales.warranty.retryPhotos' : 'sales.warranty.open')}
        </Button>
      </form>
    </Dialog>
  );
}
