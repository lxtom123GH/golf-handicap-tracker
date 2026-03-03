import { defineConfig } from 'vite';

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(`V6.1.0 - ${new Date().toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        })}`)
    },
    build: {
        chunkSizeWarningLimit: 1000
    }
});
