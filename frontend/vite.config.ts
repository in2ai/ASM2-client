import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

const config = defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, '..', ''), ...process.env }

  const logtoEndpoint = env.LOGTO_ENDPOINT || ''
  const logtoAppId = env.LOGTO_APP_ID || ''
  const logtoApiResource = env.LOGTO_API_RESOURCE || ''
  const backendUrl = env.BACKEND_URL || ''

  return {
    envDir: '..',
    define: {
      'import.meta.env.VITE_LOGTO_ENDPOINT': JSON.stringify(logtoEndpoint),
      'import.meta.env.VITE_LOGTO_APP_ID': JSON.stringify(logtoAppId),
      'import.meta.env.VITE_LOGTO_API_RESOURCE':
        JSON.stringify(logtoApiResource),
      'import.meta.env.VITE_BACKEND_URL': JSON.stringify(backendUrl),
    },
    plugins: [
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/paraglide',
      }),
      devtools(),
      tsconfigPaths({ projects: ['./tsconfig.json'] }),
      tailwindcss(),
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      viteReact(),
    ],
  }
})

export default config
