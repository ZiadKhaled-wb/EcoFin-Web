import { toast } from 'sonner';

/** The only way to show a transient result. Never `alert()`. Pass translated text. */
export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  info: (message: string) => toast(message),
};
