// Mirrors ADR-0004 D9: NIST-style. Length only. No composition rules, no trimming.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const USERNAME_MIN = 3;

export function validateNewPassword(password: string, confirm: string) {
  const errors: { password?: string; confirm?: string } = {};
  if (password.length < PASSWORD_MIN) {
    errors.password = `كلمة المرور يجب ألا تقل عن ${PASSWORD_MIN} أحرف.`;
  } else if (password.length > PASSWORD_MAX) {
    errors.password = `كلمة المرور يجب ألا تزيد عن ${PASSWORD_MAX} حرفًا.`;
  }
  if (!errors.password && password !== confirm) {
    errors.confirm = 'كلمتا المرور غير متطابقتين.';
  }
  return errors;
}
