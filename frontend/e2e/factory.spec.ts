/**
 * E2E — /factory (multi-factory console).
 *
 * docs/adr/2026-05-08-frontend-test-strategy-and-toolchain.md Category A constraint:
 * no live Go backend is required. The run-start and SSE event APIs the page calls
 * are intercepted via page.route(); the Next.js dev server is the only real process.
 *
 * Coverage:
 *   1. /factory renders both factories and the DartForge pipeline stages
 *   2. Switching to ETL swaps in the ETL pipeline stages
 *   3. Running DartForge chains converter -> reviewer and shows the Final output,
 *      with the deliverable extracted from the converter's fenced code block
 */
import { test, expect, type Page, type Route } from '@playwright/test';

import { injectSessionCookie } from './fixtures';

// ── Shared fixture data ────────────────────────────────────────────────────────

const SESSION_RESPONSE = {
  user: { sub: 'user-e2e', email: 'e2e@runkora.test', name: 'E2E User' },
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  permissions: { scopes: [], evaluatedAt: Math.floor(Date.now() / 1000) },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function mockSession(page: Page): Promise<void> {
  await page.route('**/api/auth/session', (route: Route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SESSION_RESPONSE),
    });
  });
}

/**
 * Mocks the two APIs the Factory page drives: starting a run returns a run id,
 * and that run's SSE stream immediately emits one `message_complete` event whose
 * text is keyed by the agent slug the run was started for.
 */
async function mockFactoryRuns(page: Page, outputs: Record<string, string>): Promise<void> {
  let counter = 0;
  const runToSlug = new Map<string, string>();

  await page.route('**/api/agents/types/*/runs', async (route: Route) => {
    const slug = decodeURIComponent(route.request().url().match(/\/types\/([^/]+)\/runs/)![1]);
    const id = `run-${(counter += 1)}`;
    runToSlug.set(id, slug);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ data: { id } }),
    });
  });

  await page.route('**/api/agents/runs/*/events', async (route: Route) => {
    const id = route.request().url().match(/\/runs\/([^/]+)\/events/)![1];
    const text = outputs[runToSlug.get(id) ?? ''] ?? 'ok';
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'cache-control': 'no-cache' },
      body: `event: message_complete\ndata: ${JSON.stringify({ payload: { text } })}\n\n`,
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('/factory — multi-factory console', () => {
  test.beforeEach(async ({ page }) => {
    await injectSessionCookie(page.context());
    await mockSession(page);
  });

  test('renders both factories and the DartForge pipeline', async ({ page }) => {
    await page.goto('/factory');

    await expect(page.getByRole('heading', { name: 'Factory' })).toBeVisible();
    await expect(page.getByRole('button', { name: /DartForge Converter/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /ETL Pipeline Builder/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run factory' })).toBeVisible();

    // DartForge is the default factory: its two stages render.
    await expect(page.getByText('Converter', { exact: true })).toBeVisible();
    await expect(page.getByText('Code Reviewer', { exact: true })).toBeVisible();
  });

  test('switching to ETL swaps in its pipeline', async ({ page }) => {
    await page.goto('/factory');

    await page.getByRole('button', { name: /ETL Pipeline Builder/ }).click();

    await expect(page.getByText('Designer', { exact: true })).toBeVisible();
    await expect(page.getByText('Generator', { exact: true })).toBeVisible();
    // The DartForge-only stages are gone.
    await expect(page.getByText('Code Reviewer', { exact: true })).toHaveCount(0);
  });

  test('running DartForge chains the agents to a final output', async ({ page }) => {
    await mockFactoryRuns(page, {
      'dartforge-converter':
        'Detected source language: Swift\n\n```dart\nclass P {\n  final int x;\n  const P(this.x);\n}\n```',
      'dartforge-reviewer': 'Review: faithful conversion, idiomatic Dart. No findings.',
    });

    await page.goto('/factory');
    await page.getByRole('button', { name: 'Run factory' }).click();

    // Both stages complete (the status badge reads "done").
    await expect(page.getByText('done', { exact: true })).toHaveCount(2, { timeout: 15_000 });

    // The deliverable is the converter's fenced Dart, shown under "Final output".
    // The same code also appears in the converter stage's raw output, so scope to the
    // last occurrence (the Final output block renders last in the DOM).
    await expect(page.getByRole('heading', { name: 'Final output' })).toBeVisible();
    await expect(page.getByText('class P {').last()).toBeVisible();
  });
});
