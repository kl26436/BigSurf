// Run this in the browser console to force clear all caches
console.log('🧹 FORCE CLEARING ALL CACHES');

// Unregister service workers
navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
    console.log('✅ Service workers unregistered');
});

// Clear all caches
caches.keys().then(names => {
    names.forEach(name => caches.delete(name));
    console.log('✅ All caches cleared');
});

// Wait then hard reload
setTimeout(() => {
    console.log('🔄 Reloading in 2 seconds...');
    setTimeout(() => {
        location.reload(true);
    }, 2000);
}, 1000);
