import { useEffect } from 'react';

interface VisibilitySyncOptions {
    intervalMs?: number;
    runOnMount?: boolean;
    enabled?: boolean;
}

export function useVisibilitySync(
    callback: () => void | Promise<void>,
    {
        intervalMs,
        runOnMount = true,
        enabled = true,
    }: VisibilitySyncOptions = {}
) {
    useEffect(() => {
        if (!enabled) return;

        const sync = () => {
            void callback();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                sync();
            }
        };

        if (runOnMount) {
            sync();
        }

        const timer = intervalMs ? window.setInterval(sync, intervalMs) : undefined;
        window.addEventListener('focus', sync);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (timer) {
                window.clearInterval(timer);
            }
            window.removeEventListener('focus', sync);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [callback, enabled, intervalMs, runOnMount]);
}
