// Timer Color Debugging Script
// Paste this into browser console to diagnose white timer text issue

console.log('🔍 TIMER COLOR DIAGNOSTIC');
console.log('========================\n');

// 1. Check if timer elements exist
const modalTimers = document.querySelectorAll('[id^="modal-rest-timer-"]');
console.log(`Found ${modalTimers.length} modal timer element(s)`);

modalTimers.forEach((timer, index) => {
    const display = timer.querySelector('.modal-rest-display');
    if (display) {
        const computedStyle = window.getComputedStyle(display);
        const inlineStyle = display.style.color;

        console.log(`\nTimer ${index + 1} (${timer.id}):`);
        console.log(`  - Visible: ${!timer.classList.contains('hidden')}`);
        console.log(`  - Text content: "${display.textContent}"`);
        console.log(`  - Inline style color: ${inlineStyle || 'none'}`);
        console.log(`  - Computed color: ${computedStyle.color}`);
        console.log(`  - CSS color property: ${computedStyle.getPropertyValue('color')}`);
        console.log(`  - Font size: ${computedStyle.fontSize}`);
        console.log(`  - Background: ${computedStyle.background || computedStyle.backgroundColor}`);

        // Check all CSS rules affecting this element
        const allRules = [];
        for (let sheet of document.styleSheets) {
            try {
                for (let rule of sheet.cssRules || sheet.rules) {
                    if (rule.selectorText && display.matches(rule.selectorText)) {
                        const colorValue = rule.style.getPropertyValue('color');
                        const important = rule.style.getPropertyPriority('color');
                        if (colorValue) {
                            allRules.push({
                                selector: rule.selectorText,
                                color: colorValue,
                                important: important
                            });
                        }
                    }
                }
            } catch (e) {
                // Skip cross-origin stylesheets
            }
        }

        if (allRules.length > 0) {
            console.log('  - CSS rules with color:');
            allRules.forEach(r => {
                console.log(`    ${r.selector}: ${r.color} ${r.important ? '!important' : ''}`);
            });
        }
    }
});

// 2. Check CSS variables
const root = document.documentElement;
const rootStyle = window.getComputedStyle(root);
console.log('\n📝 CSS Variables:');
console.log(`  --text-primary: ${rootStyle.getPropertyValue('--text-primary')}`);
console.log(`  --success: ${rootStyle.getPropertyValue('--success')}`);
console.log(`  --primary: ${rootStyle.getPropertyValue('--primary')}`);

// 3. Check service worker cache
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) {
            console.log('\n🔧 Service Worker:');
            console.log(`  - State: ${reg.active?.state || 'none'}`);
            console.log(`  - Script URL: ${reg.active?.scriptURL || 'none'}`);
        }
    });
}

// 4. Check if CSS file is cached
fetch('style.css', { cache: 'no-store' }).then(response => {
    console.log(`\n📄 CSS File: ${response.status === 200 ? 'loaded' : 'error'}`);
    console.log(`  - From cache: ${response.headers.get('x-cache') || 'unknown'}`);
});

console.log('\n✅ Diagnostic complete. Check output above.');
console.log('\n🔧 FIXES TO TRY:');
console.log('1. Unregister service worker:');
console.log('   navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()))');
console.log('\n2. Force set timer color:');
console.log('   document.querySelectorAll(".modal-rest-display").forEach(el => el.style.color = "#000000")');
console.log('\n3. Clear all caches:');
console.log('   caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))');
