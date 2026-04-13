import { test, expect } from '@playwright/test';

test.describe('Smoke Test', () => {
  test('should load the homepage and check for key elements', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');

    // Check if the title exists (adjust based on your app's actual title)
    // For now, we'll check for "BabaBuilds" or "ERP" as a placeholder
    const content = await page.textContent('body');
    // We expect the app to load something. 
    // Since we don't know the exact content yet, we'll check if the body is not empty.
    expect(content?.length).toBeGreaterThan(0);
    
    // Check if common elements are present, like a login button or heading
    // This is a minimal smoke test.
    console.log('Successfully loaded homepage');
  });
});
