export async function registerServiceWorker() {
  if (import.meta.env.DEV) return;
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (error) {
      console.warn('Service worker registration failed', error);
    }
  }
}
