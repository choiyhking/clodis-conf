import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps the build working under any GitHub Pages sub-path.
export default defineConfig({ base: './', plugins: [react()], server: { port: 5173 } })
