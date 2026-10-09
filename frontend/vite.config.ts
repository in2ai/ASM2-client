import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import {
  defineConfig,
  loadEnv,
  type Plugin,
  type ResolvedConfig,
} from 'vite-plus'

/**
 * Starts the body font downloading with the page.
 *
 * A browser asks for a font only once some text needs it, and here there is no
 * text until the app has loaded and rendered -- so the font came last, and the
 * page was drawn in a fallback face first. Its file name carries a build hash,
 * which is why the link cannot simply be written into `index.html`.
 *
 * Latin only: it covers Spanish, Galician and English, and preloading every
 * subset would spend the head start on files most pages never use.
 */
function preloadBodyFont(): Plugin {
  const fontFile = '/geist-latin-wght-normal.woff2'
  let resolvedConfig: ResolvedConfig | undefined

  return {
    name: 'asm2:preload-body-font',
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, { bundle }) {
        const font = Object.values(bundle ?? {}).find(
          (output) =>
            output.type === 'asset' &&
            output.originalFileNames.some((name) => name.endsWith(fontFile)),
        )

        if (!font) {
          resolvedConfig?.logger.warn(
            `[preload-body-font] ${fontFile.slice(1)} is not in the build, so nothing was preloaded`,
          )
          return
        }

        return [
          {
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              href: `${resolvedConfig?.base ?? '/'}${font.fileName}`,
              // Fonts are always fetched in CORS mode; a preload without
              // this is a different request, and gets downloaded twice.
              crossorigin: true,
            },
            injectTo: 'head',
          },
        ]
      },
    },
  }
}

const config = defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, '..', ''), ...process.env }

  const logtoEndpoint = env.LOGTO_ENDPOINT || ''
  const logtoAppId = env.LOGTO_APP_ID || ''
  const logtoApiResource = env.LOGTO_API_RESOURCE || ''
  const backendUrl = env.BACKEND_URL || ''
  const useE2eLogtoStub = env.VITE_E2E_LOGTO_STUB === 'true'

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
    test: {
      include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    },
    envDir: '..',
    resolve: {
      alias: useE2eLogtoStub
        ? {
            '@logto/react': fileURLToPath(
              new URL('./src/test/logto-e2e-stub.tsx', import.meta.url),
            ),
          }
        : undefined,
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
      devtools(),
      tailwindcss(),
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      viteReact(),
      preloadBodyFont(),
    ],
  }
})

export default config
