import { defineConfig } from 'vite'
import { engineAliases } from './shared'

// Side panel: a plain multi-page Vite app rooted at src/panel.
export default defineConfig({
    root: 'src/panel',
    base: './',
    envDir: '../..',  // .env lives in the project root, not src/panel
    publicDir: false,
    resolve: { alias: engineAliases },
    build: {
        outDir: '../../dist/panel',
        emptyOutDir: true,
        minify: false,
        assetsInlineLimit: 16384,
    },
})
