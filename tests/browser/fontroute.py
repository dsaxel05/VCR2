"""Stand-in for the sandbox font router: blocks Google Fonts so tests run offline with fallback
fonts. Delete once VCR2 self-hosts its fonts (then nothing external is requested at all)."""
async def install(page):
    async def block(route):
        await route.abort()
    await page.route('https://fonts.googleapis.com/**', block)
    await page.route('https://fonts.gstatic.com/**', block)
