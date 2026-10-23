import { registerSW } from 'virtual:pwa-register';
import { useOfflineStore } from './store';

/**
 * S08 (D15): registers the service worker of the production build. A new version only waits
 * (`registerType: 'prompt'`); OfflineController takes it when online, with an empty outbox and an
 * idle POS (D15.2), by sending `ecofin:apply-update`. Never mid-sale.
 */
export function registerApp() {
  const update = registerSW({
    // Loaded after the page: the window's load event may be gone already.
    immediate: true,
    onNeedRefresh: () => useOfflineStore.getState().set({ updateWaiting: true }),
  });
  window.addEventListener('ecofin:apply-update', () => {
    useOfflineStore.getState().set({ updateWaiting: false });
    void update(true);
  });
}
