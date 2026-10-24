import { useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import Drawer from '@/components/ui/Drawer';
import BranchSwitcher from '@/components/layout/BranchSwitcher';
import Wordmark from '@/components/ui/Wordmark';
import SidebarNav from '@/components/layout/SidebarNav';
import Topbar from '@/components/layout/Topbar';
import { NAV, filterNav, navLeaves } from '@/config/navigation';
import { usePermissions } from '@/features/me/usePermissions';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import SubscriptionBanner from '@/features/subscription/SubscriptionBanner';
import { useShopModules } from '@/features/subscription/useShopModules';
import OfflineController from '@/offline/OfflineController';
import { useOfflineStore } from '@/offline/store';

/** S08 (D4): offline, the menu keeps only the sale screen; everything else needs the server. */
const OFFLINE_NAV = navLeaves().filter((i) => i.id === 'pos');

/**
 * Signed-in frame: sidebar (lg+) or drawer (mobile), topbar, and the page outlet.
 * Pages render their own PageContainer/PageHeader; full-bleed screens (POS) can skip them.
 */
export default function AppShell() {
  const user = useAuthStore((s) => s.user);
  const permissions = usePermissions();
  const keys = permissions.data?.keys;
  const modules = useShopModules();
  const offline = useOfflineStore((s) => s.mode.mode === 'offline');
  const items = useMemo(
    () =>
      offline
        ? OFFLINE_NAV
        : filterNav(NAV, user && keys ? { ...user, permissions: [...keys] } : user, modules),
    [user, keys, offline, modules],
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <OfflineController />
      <a
        href="#main"
        className="sr-only z-(--z-toast) rounded-control bg-brand-600 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {t('shell.skipToContent')}
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col border-e border-line bg-surface lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-line px-5">
          <Wordmark size="md" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav items={items} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <Topbar onMenuClick={() => setDrawerOpen(true)} menuOpen={drawerOpen} />
        <main id="main" className="flex-1">
          <SubscriptionBanner />
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title={t('shell.menu')}>
        {/* Below md the top bar has no room for the branch switcher (see Topbar). */}
        <div className="border-b border-line px-4 pb-4 md:hidden">
          <BranchSwitcher />
        </div>
        <SidebarNav items={items} onNavigate={() => setDrawerOpen(false)} />
      </Drawer>
    </div>
  );
}
