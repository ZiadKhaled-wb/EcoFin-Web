import { zodResolver } from '@hookform/resolvers/zod';
import {
  useForm,
  type FieldValues,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import type { ZodType, ZodTypeDef } from 'zod';
import { markerFor, translatedErrorMap } from '@/components/ui/formErrors';

/**
 * react-hook-form bound to a contract zod schema. Errors are translated at render time, so the
 * English contract messages never reach the screen. Pass the schema's INPUT type as `TInput`
 * (the shape the fields hold) and read the parsed OUTPUT in `handleSubmit`.
 */
export function useZodForm<TInput extends FieldValues, TOutput = TInput>(
  schema: ZodType<TOutput, ZodTypeDef, TInput>,
  options: Omit<UseFormProps<TInput, unknown, TOutput>, 'resolver'> = {},
): UseFormReturn<TInput, unknown, TOutput> {
  const base = zodResolver(schema, {
    path: [],
    async: true,
    errorMap: translatedErrorMap,
  }) as Resolver<TInput, unknown, TOutput>;
  // Issues that carry their own message (refinements, regex messages) bypass the error map,
  // so the schema is also re-checked here to give them the same marker.
  const resolver: Resolver<TInput, unknown, TOutput> = async (values, context, opts) => {
    const result = await base(values, context, opts);
    if (!Object.keys(result.errors).length) return result;
    const parsed = await schema.safeParseAsync(values);
    if (parsed.success) return result;
    const errors = { ...result.errors } as Record<string, { message?: string; type?: string }>;
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      const current = errors[path];
      if (current && !current.message?.startsWith('i18n:')) {
        errors[path] = { ...current, message: markerFor(issue) };
      }
    }
    return { ...result, errors } as typeof result;
  };
  return useForm<TInput, unknown, TOutput>({ mode: 'onTouched', ...options, resolver });
}
