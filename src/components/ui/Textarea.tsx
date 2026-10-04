import { useId, type TextareaHTMLAttributes } from 'react';
import FieldShell from '@/components/ui/FieldShell';
import { describedBy } from '@/lib/a11y';
import { cn } from '@/lib/cn';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  help?: string;
  invalid?: boolean;
};

export default function Textarea({
  label,
  error,
  help,
  invalid,
  id,
  className,
  rows = 4,
  ...rest
}: Props) {
  const autoId = useId();
  const areaId = id ?? autoId;
  const bad = !!error || invalid;
  return (
    <FieldShell id={areaId} label={label} error={error} help={help}>
      <textarea
        id={areaId}
        rows={rows}
        aria-invalid={bad ? true : undefined}
        aria-describedby={describedBy(areaId, error, help)}
        className={cn('field-input min-h-24 resize-y', bad && 'field-input-error', className)}
        {...rest}
      />
    </FieldShell>
  );
}
