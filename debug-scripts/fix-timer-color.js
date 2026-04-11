// NUCLEAR OPTION: Force fix timer color
// If timer is still white after hard reload, paste this into console

console.log('🔧 FORCING TIMER COLOR FIX...\n');

// Step 1: Unregister all service workers
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
        console.log(`Found ${registrations.length} service worker(s)`);
        registrations.forEach((registration, index) => {
            registration.unregister().then(success => {
                console.log(`✅ Service worker ${index + 1} unregistered: ${success}`);
            });
        });
    });
}

// Step 2: Clear all caches
if ('caches' in window) {
    caches.keys().then(cacheNames => {
        console.log(`Found ${cacheNames.length} cache(s)`);
        return Promise.all(
            cacheNames.map(cacheName => {
                console.log(`🗑️ Deleting cache: ${cacheName}`);
                return caches.delete(cacheName);
            })
        );
    }).then(() => {
        console.log('✅ All caches cleared');
    });
}

// Step 3: Force set timer colors immediately
setTimeout(() => {
    const timers = document.querySelectorAll('.modal-rest-display, .rest-timer-display');
    console.log(`\n🎨 Found ${timers.length} timer display(s)`);

    timers.forEach((timer, index) => {
        timer.style.setProperty('color', '#000000', 'important');
        console.log(`✅ Timer ${index + 1} color forced to black`);
    });

    console.log('\n✅ DONE! Now hard reload: Ctrl+Shift+R');
    console.log('   Then test by completing a set to trigger rest timer');
}, 1000);
