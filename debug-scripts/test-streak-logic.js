// Test streak calculation logic
// Paste this in console to verify streak calculation

const testStreakLogic = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Simulate last workout was yesterday
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const workoutDates = [yesterday.toISOString().split('T')[0]];

    let currentStreak = 0;

    for (let i = workoutDates.length - 1; i >= 0; i--) {
        const workoutDate = new Date(workoutDates[i]);
        workoutDate.setHours(0, 0, 0, 0);

        if (i === workoutDates.length - 1) {
            const daysDiff = Math.floor((today - workoutDate) / (1000 * 60 * 60 * 24));
            console.log(`Days since last workout: ${daysDiff}`);

            if (daysDiff === 0) {
                console.log('✅ Worked out today - streak active');
                currentStreak = 1;
            } else if (daysDiff === 1) {
                console.log('✅ Worked out yesterday - grace period applies, streak still active');
                currentStreak = 1;
            } else {
                console.log(`❌ Last workout was ${daysDiff} days ago - streak broken`);
                break;
            }
        }
    }

    console.log(`\nCurrent Streak: ${currentStreak} day(s)`);
    return currentStreak;
};

// Run test
testStreakLogic();
