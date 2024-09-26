import { test, expect } from '@playwright/test';

const httpHost = process.env.HTTP_HOST

if (typeof httpHost !== 'string') {
    throw new Error('Environment variable "HTTP_HOST" is not set.')
}

test.beforeEach(async ({ page }) => {
    await page.goto(httpHost);
});

const openSearchDialog = async (page) => {
    await page.getByRole('button', {name: 'Search'}).click();
    return page.getByRole('dialog', { name: 'Search dialog' });
}

const expectOption = async (dialog, name) => {
    await expect(dialog.getByRole('option', { name })).toBeVisible();
}

const expectSelectedOption = async (dialog, name) => {
    await expect(dialog.getByRole('option', { name, selected: true })).toBeVisible();
}

test('should open search dialog when search button is clicked', async ({ page }) => {
    const searchDialog = await openSearchDialog(page);
    await expect(searchDialog).toBeVisible();
});

test('should disable window scroll when search dialog is open', async ({ page }) => {
    await openSearchDialog(page);
    await page.mouse.wheel(0, 100);
    const currentScrollY = await page.evaluate(() => window.scrollY);
    expect(currentScrollY).toBe(0);
});

test('should focus on search input when dialog is opened', async ({ page }) => {
    const dialog = await openSearchDialog(page);
    const searchInput = dialog.getByRole('textbox', { name: 'Search PHP docs' });
    await expect(searchInput).toBeFocused();
    await expect(searchInput).toHaveValue('');
});

test('should close search dialog when close button is clicked', async ({ page }) => {
    const dialog = await openSearchDialog(page);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();
});

test('should re-enable window scroll when search dialog is closed', async ({ page }) => {
    const dialog = await openSearchDialog(page);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();
    await page.mouse.wheel(0, 100);
    const currentScrollY = await page.evaluate(() => window.scrollY);
    expect(currentScrollY).toBe(100);
});

test('should close search dialog when Escape key is pressed', async ({ page }) => {
    const dialog = await openSearchDialog(page);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
});

test('should close search dialog when clicking outside of it', async ({ page }) => {
    const dialog = await openSearchDialog(page);
    await page.click('#php-search-container', { position: { x: 10, y: 10 } });
    await expect(dialog).not.toBeVisible();
});

test('should perform search and display results', async ({ page }) => {
    const dialog = await openSearchDialog(page);
    await dialog.getByRole('textbox').fill('array');
    await expect(
        await dialog.getByRole('listbox', { name: 'Search results' }).getByRole('option')
    ).toHaveCount(30);
});

test('should navigate through search results with arrow keys', async ({ page }) => {
    const dialog = await openSearchDialog(page);
    await dialog.getByRole('textbox').fill('strlen');
    await expectOption(dialog, /^strlen$/);

    await page.keyboard.press('ArrowDown');
    await expectSelectedOption(dialog, /^strlen$/);

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expectSelectedOption(dialog, /^mb_strlen$/);

    await page.keyboard.press('ArrowUp');
    await expectSelectedOption(dialog, /^iconv_strlen$/);
});

test('should navigate to selected result page when Enter is pressed', async ({ page }) => {
    const dialog = await openSearchDialog(page);
    await dialog.getByRole('textbox').fill('strpos');
    await expectOption(dialog, /^strpos$/);

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`${httpHost}/manual/en/function.strpos.php`);
});

test('should navigate to search page when Enter is pressed with no selection', async ({ page }) => {
    const dialog = await openSearchDialog(page);
    await dialog.getByRole('textbox').fill('php basics');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`${httpHost}/search.php?lang=en&q=php%20basics`);
});
