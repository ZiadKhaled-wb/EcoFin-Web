import { AlertIcon } from '@/components/ui/Icons';

/** Form-level error (not tied to one field): a pale red pill with an icon. */
export default function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="notice notice-error flex items-center gap-2.5 py-2.5">
      <AlertIcon width={18} height={18} className="shrink-0" />
      <span>{message}</span>
    </p>
  );
}
