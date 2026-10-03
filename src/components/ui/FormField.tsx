import { useId } from 'react';
import FieldShell from '@/components/ui/FieldShell';
import { describedBy } from '@/lib/a11y';
import Input, { type InputProps } from '@/components/ui/Input';

type Props = InputProps & { label: string; error?: string; help?: string };

/** Label + Input + help + error. Every text-like field in the app uses this. */
export default function FormField({ label, error, help, id, invalid, ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell id={inputId} label={label} error={error} help={help}>
      <Input
        id={inputId}
        invalid={!!error || invalid}
        aria-describedby={describedBy(inputId, error, help)}
        {...rest}
      />
    </FieldShell>
  );
}
