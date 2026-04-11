// AGGRESSIVE CACHE CLEAR - Run this in console

console.log('🧹 AGGRESSIVE CACHE CLEAR');
console.log('=========================\n');

// Step 1: Unregister ALL service workers
console.log('1️⃣ Unregistering service workers...');
navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach((registration, index) => {
        registration.unregister().then(success => {
            console.log(`  ✅ Service worker ${index + 1} unregistered`);
        });
    });
    if (registrations.length === 0) {
        console.log('  ℹ️ No service workers found');
    }
});

// Step 2: Clear ALL caches
console.log('\n2️⃣ Clearing all caches...');
caches.keys().then(cacheNames => {
    if (cacheNames.length === 0) {
        console.log('  ℹ️ No caches found');
    }
    return Promise.all(
        cacheNames.map(cacheName => {
            console.log(`  🗑️ Deleting: ${cacheName}`);
            return caches.delete(cacheName);
        })
    );
}).then(() => {
    console.log('  ✅ All caches cleared');
});

// Step 3: Clear localStorage
console.log('\n3️⃣ Clearing localStorage...');
const localStorageKeys = Object.keys(localStorage);
console.log(`  Found ${localStorageKeys.length} localStorage items`);
// Don't clear everything - might have important data
// localStorage.clear();
console.log('  ℹ️ Skipping localStorage (preserves user data)');

// Step 4: Clear sessionStorage
console.log('\n4️⃣ Clearing sessionStorage...');
sessionStorage.clear();
console.log('  ✅ sessionStorage cleared');

// Step 5: Force reload CSS with cache-busting
console.log('\n5️⃣ Force reloading CSS file...');
const timestamp = Date.now();
fetch(`style.css?v=${timestamp}`, { cache: 'reload' })
    .then(response => {
        console.log(`  ✅ CSS reloaded (status: ${response.status})`);
        console.log(`  Cache header: ${response.headers.get('cache-control') || 'none'}`);
    })
    .catch(error => {
        console.error(`  ❌ CSS reload failed:`, error);
    });

// Step 6: Wait and then hard reload
setTimeout(() => {
    console.log('\n✅ DONE! All caches cleared.');
    console.log('\n🔄 NEXT STEPS:');
    console.log('1. Close ALL tabs of this app');
    console.log('2. Wait 5 seconds');
    console.log('3. Open the app in a NEW tab');
    console.log('\nOR just press: Ctrl + Shift + R (hard reload)');
}, 2000);
