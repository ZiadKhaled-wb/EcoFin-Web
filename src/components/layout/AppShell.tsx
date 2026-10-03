import { useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Drawer from '@/components/ui/Drawer';
import Wordmark from '@/components/ui/Wordmark';
import SidebarNav from '@/components/layout/SidebarNav';
import Topbar from '@/components/layout/Topbar';
import { NAV, filterNav } from '@/config/navigation';
import { useAuthStore } from '@/store/authStore';

/**
 * Signed-in frame: sidebar (lg+) or drawer (mobile), topbar, and the page outlet.
 * Pages render their own PageContainer/PageHeader; full-bleed screens (POS) can skip them.
 */
export default function AppShell() {
  const user = useAuthStore((s) => s.user);
  const items = useMemo(() => filterNav(NAV, user), [user]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-(--z-toast) rounded-control bg-brand-600 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        تخطّي إلى المحتوى
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
        <Topbar onMenuClick={() => setDrawerOpen(true)} />
        <main id="main" className="flex-1">
          <Outlet />
        </main>
      </div>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="القائمة">
        <SidebarNav items={items} onNavigate={() => setDrawerOpen(false)} />
      </Drawer>
    </div>
  );
}
