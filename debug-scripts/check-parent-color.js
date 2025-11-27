// Check parent timer color
const timer = document.querySelector('[id^="modal-rest-timer-"]');
const display = timer?.querySelector('.modal-rest-display');

if (timer && display) {
    console.log('🔍 Timer Element Hierarchy:');
    console.log('===========================\n');

    // Walk up the DOM tree
    let element = display;
    let level = 0;

    while (element && level < 5) {
        const computed = window.getComputedStyle(element);
        const inline = element.style.color;

        console.log(`Level ${level}: <${element.tagName.toLowerCase()}${element.className ? '.' + element.className.split(' ').join('.') : ''}${element.id ? '#' + element.id : ''}>`);
        console.log(`  Inline color: ${inline || 'none'}`);
        console.log(`  Computed color: ${computed.color}`);
        console.log(`  Background: ${computed.background || computed.backgroundColor}`);
        console.log('');

        element = element.parentElement;
        level++;
    }
}
