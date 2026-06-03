import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite-plus'

const config = defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, '..', ''), ...process.env }

  const logtoEndpoint = env.LOGTO_ENDPOINT || ''
  const logtoAppId = env.LOGTO_APP_ID || ''
  const logtoApiResource = env.LOGTO_API_RESOURCE || ''
  const backendUrl = env.BACKEND_URL || ''

  return {
    lint: {
      jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
      rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
      options: { typeAware: true, typeCheck: true },
    },
    fmt: {
      semi: false,
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 80,
      sortPackageJson: false,
      ignorePatterns: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'],
    },
    envDir: '..',
    resolve: {
      tsconfigPaths: true,
    },
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
      tailwindcss(),
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      viteReact(),
    ],
  }
})

export default config
