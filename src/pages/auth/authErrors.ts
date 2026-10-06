import { Password } from '@ziadkhaled-wb/contracts';
import { ApiError } from '@/lib/api';
import { t, type TranslationKey } from '@/i18n';

/**
 * Maps an auth error to translated text. Server wording is never shown.
 * Account-probing codes (unknown shop) read like a wrong password.
 */
export function loginErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return t('auth.errors.loginFailed');
  const byCode: Partial<Record<string, TranslationKey>> = {
    INVALID_CREDENTIALS: 'auth.errors.invalidCredentials',
    TENANT_NOT_FOUND: 'auth.errors.invalidCredentials',
    ACCOUNT_DISABLED: 'auth.errors.accountDisabled',
    SHOP_INACTIVE: 'auth.errors.shopInactive',
    ORG_SUSPENDED: 'auth.errors.shopInactive',
    SUBSCRIPTION_EXPIRED: 'auth.errors.subscriptionExpired',
    TOO_MANY_LOGIN_ATTEMPTS: 'auth.errors.tooManyAttempts',
    NETWORK_ERROR: 'errors.network',
  };
  const key = byCode[err.code];
  if (key) return t(key);
  return t(err.status === 401 ? 'auth.errors.invalidCredentials' : 'auth.errors.loginFailed');
}

export function selectShopErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'NETWORK_ERROR') return t('errors.network');
    if (err.code === 'SHOP_NOT_ALLOWED') return t('auth.errors.shopNotAllowed');
    if (err.code === 'SHOP_INACTIVE' || err.code === 'ORG_SUSPENDED')
      return t('auth.errors.shopInactive');
    if (err.code === 'SUBSCRIPTION_EXPIRED') return t('auth.errors.subscriptionExpired');
  }
  return t('auth.errors.selectShopFailed');
}

/** Client-side check of a new password and its confirmation, using the contract rule (8 to 72). */
export function validateNewPassword(password: string, confirm: string) {
  const errors: { password?: string; confirm?: string } = {};
  if (!Password.safeParse(password).success) {
    errors.password = t(password.length > 72 ? 'auth.password.tooLong' : 'auth.password.tooShort');
  } else if (password !== confirm) {
    errors.confirm = t('auth.password.mismatch');
  }
  return errors;
}
