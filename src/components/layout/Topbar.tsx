import { ChevronDownIcon, LogoutIcon, MenuIcon } from '@/components/ui/Icons';
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

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const user = useAuthStore((s) => s.user);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const name = user?.username ?? user?.email ?? '';

  return (
    <header className="sticky top-0 z-(--z-sticky) flex h-16 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
      <IconButton
        className="lg:hidden"
        label="فتح القائمة"
        icon={<MenuIcon />}
        onClick={onMenuClick}
      />
      <Wordmark size="md" className="lg:hidden" />

      <div className="ms-auto flex items-center gap-3">
        {tenantSlug && (
          <span dir="ltr" className="hidden font-mono text-xs text-ink-mute sm:inline">
            {tenantSlug}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-h-11 items-center gap-2 rounded-control px-2 hover:bg-paper"
              aria-label="قائمة الحساب"
            >
              <span
                aria-hidden
                className="flex size-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold uppercase text-white"
              >
                {name.charAt(0) || '؟'}
              </span>
              <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{name}</span>
              <ChevronDownIcon size={16} className="text-ink-mute" />
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
            {/* Logout clears the session; route guards then redirect to /login. */}
            <DropdownMenuItem
              tone="danger"
              icon={<LogoutIcon />}
              onSelect={() => void authApi.logout()}
            >
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
