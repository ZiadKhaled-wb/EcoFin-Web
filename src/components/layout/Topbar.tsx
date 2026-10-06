import BranchSwitcher from '@/components/layout/BranchSwitcher';
import LanguageSwitch from '@/components/layout/LanguageSwitch';
import { t } from '@/i18n';
import { useNavigate } from 'react-router-dom';
import { ChevronDownIcon, LogoutIcon, MenuIcon, StoreIcon } from '@/components/ui/Icons';
import Badge from '@/components/ui/Badge';
import IconButton from '@/components/ui/IconButton';
import Wordmark from '@/components/ui/Wordmark';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { authApi } from '@/services/authApi';
import { useAuthStore } from '@/store/authStore';
import { ROLE_LABELS } from '@/types/auth';

export default function Topbar({
  onMenuClick,
  menuOpen = false,
}: {
  onMenuClick: () => void;
  menuOpen?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const shopCount = useAuthStore((s) => s.shops.length);
  const navigate = useNavigate();
  const name = user?.username ?? user?.email ?? '';

  return (
    <header className="sticky top-0 z-(--z-sticky) flex h-16 items-center gap-2 border-b border-line bg-surface px-4 sm:px-6">
      <IconButton
        className="shrink-0 lg:hidden"
        label={t('shell.openMenu')}
        icon={<MenuIcon />}
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        onClick={onMenuClick}
      />
      <Wordmark size="md" className="shrink-0 lg:hidden" />

      <div className="ms-auto flex min-w-0 items-center gap-2 sm:gap-3">
        {/* Below md the branch switcher lives in the menu drawer (AppShell), so the bar fits 360 px. */}
        <div className="hidden md:block">
          <BranchSwitcher />
        </div>
        <LanguageSwitch />
        {tenantSlug && (
          // No room for the shop code next to the branch switcher until the sidebar takes the menu (lg).
          <span
            dir="ltr"
            className="hidden whitespace-nowrap font-mono text-xs text-ink-mute sm:inline md:hidden lg:inline"
          >
            {tenantSlug}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-h-11 items-center gap-2 rounded-control px-2 hover:bg-paper"
              aria-label={t('shell.accountMenu')}
            >
              <span
                aria-hidden
                className="flex size-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold uppercase text-white"
              >
                {name.charAt(0) || t('shell.unknownUser')}
              </span>
              <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{name}</span>
              <ChevronDownIcon size={16} className="hidden text-ink-mute sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>
              <p className="truncate text-sm font-semibold">{name}</p>
              {user && (
                <div className="mt-1">
                  <Badge tone="brand">{ROLE_LABELS[user.role]}</Badge>
                </div>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* EC-143: a login in several shops switches here (the picker calls select-shop; every
                query is keyed by the shop, so nothing of the old shop is shown after). */}
            {shopCount > 1 && (
              <DropdownMenuItem icon={<StoreIcon />} onSelect={() => navigate('/select-shop')}>
                {t('shell.switchShop')}
              </DropdownMenuItem>
            )}
            {/* Logout clears the session; route guards then redirect to /login. */}
            <DropdownMenuItem
              tone="danger"
              icon={<LogoutIcon />}
              onSelect={() => void authApi.logout()}
            >
              {t('shell.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
