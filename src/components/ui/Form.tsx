import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import FormField from '@/components/ui/FormField';
import type { InputProps } from '@/components/ui/Input';
import { fieldErrorText } from '@/components/ui/formErrors';

type TextFieldProps<T extends FieldValues> = Omit<
  InputProps,
  'name' | 'value' | 'onChange' | 'onBlur' | 'defaultValue'
> & {
  control: Control<T, unknown, T>;
  name: FieldPath<T>;
  label: string;
  help?: string;
};

/** A text-like field wired to the form: label, translated error, aria wiring. */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  help,
  ...rest
}: TextFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField
          {...rest}
          label={label}
          help={help}
          name={field.name}
          ref={field.ref}
          value={(field.value as string | undefined) ?? ''}
          onChange={field.onChange}
          onBlur={field.onBlur}
          error={fieldErrorText(fieldState.error)}
        />
      )}
    />
  );
}
