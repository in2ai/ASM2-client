import { expect, test } from '@playwright/test'

test.describe('sign-in experience', () => {
  test('renders the default sign-in screen', async ({ page }) => {
    await page.goto('/sign-in')

    await expect(page.getByText('ASM2 Central')).toBeVisible()
    await expect(
      page.getByText('Inicia sesión para acceder al dashboard de métricas'),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Iniciar sesión' }),
    ).toBeVisible()
  })

  test('stores the return target before starting sign in', async ({ page }) => {
    await page.goto('/sign-in?returnTo=/chat')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()

    await expect
      .poll(() =>
        page.evaluate(() => sessionStorage.getItem('dashboard:returnTo')),
      )
      .toBe('/chat')
  })

  test('switches sign-in copy to English', async ({ page }) => {
    await page.goto('/sign-in')

    await page.getByRole('button', { name: 'Cambiar idioma' }).click()
    await page.getByRole('menuitem', { name: 'Inglés' }).click()

    await expect(
      page.getByText('Sign in to access the metrics dashboard'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Change language' }),
    ).toBeVisible()
  })
})
