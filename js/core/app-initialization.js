// App Initialization Module - core/app-initialization.js
// Handles application startup, authentication, and global setup

import { auth, provider, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, db } from './firebase-config.js';
import { GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { AppState } from './app-state.js';
import { showNotification, setTodayDisplay } from './ui-helpers.js';
import { loadWorkoutPlans } from './data-manager.js'; // ADD loadWorkoutData here
import { getExerciseLibrary } from './exercise-library.js';
import { getWorkoutHistory } from './workout-history.js';
import { initializeWorkoutManagement } from '../core/workout/workout-management-ui.js';
import { initializeErrorHandler, startConnectionMonitoring } from './error-handler.js';

// ===================================================================
// LOADING SCREEN MANAGEMENT
// ===================================================================

export function showLoadingScreen(message = 'Initializing...') {
    const loadingScreen = document.getElementById('loading-screen');
    const loadingMessage = document.getElementById('loading-message');

    if (loadingScreen) {
        loadingScreen.classList.remove('hidden');
        loadingScreen.style.opacity = '1';
    }

    if (loadingMessage && message) {
        loadingMessage.textContent = message;
    }
}

export function updateLoadingMessage(message) {
    const loadingMessage = document.getElementById('loading-message');
    if (loadingMessage) {
        loadingMessage.textContent = message;
    }
}

export function showSignInPrompt() {
    const signInPrompt = document.getElementById('loading-signin-prompt');
    const loadingSpinner = document.querySelector('.loading-spinner');
    const loadingMessage = document.getElementById('loading-message');

    // Hide spinner and message
    if (loadingSpinner) loadingSpinner.style.display = 'none';
    if (loadingMessage) loadingMessage.style.display = 'none';

    // Show sign-in prompt
    if (signInPrompt) {
        signInPrompt.classList.remove('hidden');
    }

    // Set up sign-in button in loading screen
    const loadingSignInBtn = document.getElementById('loading-signin-btn');
    if (loadingSignInBtn) {
        loadingSignInBtn.onclick = () => {
            signIn();
        };
    }
}

export function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.classList.add('hidden');
        }, 300); // Match CSS transition time
    }
}

// ===================================================================
// MAIN APP INITIALIZATION
// ===================================================================

export function initializeWorkoutApp() {
    console.log(' Initializing Big Surf Workout Tracker...');

    // Show loading screen immediately
    showLoadingScreen('Initializing...');

    // Initialize global error handling FIRST
    initializeErrorHandler();

    try {
        updateLoadingMessage('Loading exercise library...');

        // Initialize exercise library BEFORE auth (so it's always available)
        const exerciseLibrary = getExerciseLibrary(AppState);
        exerciseLibrary.initialize();
        window.exerciseLibrary = exerciseLibrary;

        updateLoadingMessage('Initializing workout history...');

        // Initialize workout history
        const workoutHistory = getWorkoutHistory(AppState);
        workoutHistory.initialize();
        window.workoutHistory = workoutHistory;

        // Start connection monitoring
        startConnectionMonitoring(db);

        console.log(' Core modules initialized successfully');
        
    } catch (error) {
        console.error(' Error initializing modules:', error);
        showNotification('Error initializing app modules', 'error');
    }

    // Set up authentication listener first (this will handle redirect result)
    setupAuthenticationListener();

    console.log(' App initialization completed');
}

export function initializeEnhancedWorkoutSelector() {
    console.log(' Initializing enhanced workout selector...');
    
    // Set up workout category filters
    setupWorkoutFilters();
    
    // Set up workout search
    setupWorkoutSearch();
    
    // Load initial workout data
    if (AppState.workoutPlans && AppState.workoutPlans.length > 0) {
        renderInitialWorkouts();
    }
    
    console.log(' Enhanced workout selector initialized');
}

// ===================================================================
// AUTHENTICATION
// ===================================================================

let signingIn = false; // Prevent multiple simultaneous sign-in attempts

export async function signIn() {
    // Prevent multiple popups from opening
    if (signingIn) {
        console.log('⚠️ Sign-in already in progress, ignoring duplicate request');
        return;
    }

    try {
        signingIn = true;
        console.log('🔐 signIn() function called');
        console.log('💻 Using popup auth (works on mobile when triggered by user click)');

        // Create a provider instance with account selection prompt
        const signInProvider = new GoogleAuthProvider();
        signInProvider.setCustomParameters({
            prompt: 'select_account'
        });

        const result = await signInWithPopup(auth, signInProvider);
        console.log('✅ Sign-in successful:', result.user.displayName);
        // Welcome message removed - loading screen will show "Loading your workouts..." instead
    } catch (error) {
        console.error('❌ Sign-in error:', error);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error message:', error.message);

        if (error.code === 'auth/popup-closed-by-user') {
            showNotification('Sign-in cancelled', 'info');
        } else if (error.code === 'auth/popup-blocked') {
            showNotification('Popup blocked - please allow popups and try again', 'warning');
        } else if (error.code === 'auth/cancelled-popup-request') {
            // Ignore - this happens when multiple sign-in attempts overlap
            console.log('ℹ️ Duplicate popup request cancelled');
        } else {
            showNotification('Sign-in failed. Please try again.', 'error');
        }
    } finally {
        signingIn = false;
    }
}

export async function signOutUser() {
    try {
        await signOut(auth);
        console.log('✅ Sign-out successful');

        // Close hamburger menu
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');

        // Hide all content sections
        const sections = [
            'workout-selector',
            'active-workout',
            'workout-history-section',
            'workout-management-section',
            'exercise-manager-section',
            'dashboard',
            'stats-section'
        ];

        sections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) section.classList.add('hidden');
        });

        // Hide resume workout banner if showing
        const resumeBanner = document.getElementById('resume-workout-banner');
        if (resumeBanner) resumeBanner.classList.add('hidden');

        // Hide the header auth section and show proper loading screen
        const authSection = document.getElementById('auth-section');
        if (authSection) authSection.classList.add('hidden');

        // Show loading screen with sign-in prompt (same as fresh page load)
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) loadingScreen.classList.remove('hidden');

        showSignInPrompt();

        // Clear app state completely
        AppState.currentUser = null;
        AppState.currentWorkout = null;
        AppState.savedData = {};
        AppState.workoutStartTime = null;
        AppState.workoutPauseStartTime = null;
        AppState.totalPausedTime = 0;
        window.inProgressWorkout = null;

        console.log('✅ User signed out - showing sign-in screen');
    } catch (error) {
        console.error('❌ Sign-out error:', error);
        showNotification('Error signing out', 'error');
    }
}

export function showUserInfo(user) {
    // Hide main auth section entirely
    const authSection = document.getElementById('auth-section');
    if (authSection) authSection.classList.add('hidden');

    // Show and populate sidebar user profile
    const sidebarProfile = document.getElementById('sidebar-user-profile');
    const sidebarUserName = document.getElementById('sidebar-user-name');
    const sidebarUserEmail = document.getElementById('sidebar-user-email');

    if (sidebarProfile) sidebarProfile.classList.remove('hidden');
    if (sidebarUserName) sidebarUserName.textContent = user.displayName || 'User';
    if (sidebarUserEmail) sidebarUserEmail.textContent = user.email || '';

    console.log(' User info displayed for:', user.displayName);
}

export function hideUserInfo() {
    // Show main auth section
    const authSection = document.getElementById('auth-section');
    if (authSection) authSection.classList.remove('hidden');

    // Hide sidebar user profile
    const sidebarProfile = document.getElementById('sidebar-user-profile');
    if (sidebarProfile) sidebarProfile.classList.add('hidden');

    console.log(' User info hidden');
}

export function setupAuthenticationListener() {
    console.log('🔐 Setting up authentication listener...');

    // Handle redirect result (user coming back from Google sign-in)
    console.log('🔍 Checking for redirect result...');
    getRedirectResult(auth)
        .then((result) => {
            console.log('🔍 Redirect result received:', result);
            if (result && result.user) {
                console.log('✅ Sign-in redirect successful:', result.user.displayName);
                // Don't show notification here - onAuthStateChanged will handle it
            } else {
                console.log('ℹ️ No redirect result (user did not just sign in via redirect)');
            }
        })
        .catch((error) => {
            console.error('❌ Redirect result error:', error);
            // Only show error if it's a real error, not a cancellation
            if (error.code && error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
                console.error('❌ Redirect sign-in error:', error);
                showNotification('Sign-in failed. Please try again.', 'error');
            }
        });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log('👤 User signed in:', user.displayName || user.email);
            AppState.currentUser = user;

            // Update UI
            showUserInfo(user);

            // Update loading message
            updateLoadingMessage('Loading your workouts...');

            // Load ALL data FIRST (loadWorkoutPlans loads both plans AND exercises)
            await loadWorkoutPlans(AppState);
            console.log('✅ Data loaded - Plans:', AppState.workoutPlans.length, 'Exercises:', AppState.exerciseDatabase.length);

            // Load PR tracking data
            const { PRTracker } = await import('./pr-tracker.js');
            await PRTracker.loadPRData();

            // Initialize background notifications
            const { initializeNotifications } = await import('./notification-helper.js');
            await initializeNotifications();

            // Validate and refresh user data
            await validateUserData();

            // THEN check for in-progress workouts (now plans will be loaded!)
            await checkForInProgressWorkoutEnhanced();

            // Hide loading screen - data is ready!
            setTimeout(() => {
                hideLoadingScreen();

                // Show dashboard by default
                const { navigateTo } = window;
                if (navigateTo) {
                    navigateTo('dashboard');
                }
            }, 500);

        } else {
            console.log('👤 User signed out');
            AppState.currentUser = null;

            // Hide all content sections
            const sections = [
                'workout-selector',
                'active-workout',
                'workout-history-section',
                'workout-management-section',
                'exercise-manager-section',
                'dashboard',
                'stats-section'
            ];

            sections.forEach(sectionId => {
                const section = document.getElementById(sectionId);
                if (section) section.classList.add('hidden');
            });

            // Show sign-in prompt
            showSignInPrompt();
            hideUserInfo();
        }
    });
}

// ===================================================================
// DATA LOADING AND VALIDATION
// ===================================================================

export async function validateUserData() {
    if (!AppState.currentUser) return;
    
    console.log('🔍 Validating user data...');
    
    try {
        // Refresh exercise database during validation
        await refreshExerciseDatabase();
        
        // Load user's workout templates
        const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const templates = await workoutManager.getUserWorkoutTemplates();
        
        // Check custom exercises
        const customExercises = AppState.exerciseDatabase.filter(ex => ex.isCustom);
        
        console.log(` User data validation: - Templates: ${templates.length} - Custom exercises: ${customExercises.length} - Total exercises: ${AppState.exerciseDatabase.length}`);
        
        
    } catch (error) {
        console.error(' Error validating user data:', error);
        showNotification('Error loading user data', 'warning');
    }
}

export async function refreshExerciseDatabase() {
    console.log(' Refreshing exercise database...');
    
    try {
        if (AppState.currentUser) {
            // Load full exercise library with user customizations
            const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
            const workoutManager = new FirebaseWorkoutManager(AppState);
            AppState.exerciseDatabase = await workoutManager.getExerciseLibrary();
        } else {
            // Load default exercises only
            const exerciseResponse = await fetch('./data/exercises.json');
            if (exerciseResponse.ok) {
                AppState.exerciseDatabase = await exerciseResponse.json();
            }
        }
        
        console.log(` Exercise database refreshed: ${AppState.exerciseDatabase.length} exercises`);
        
    } catch (error) {
        console.error(' Error refreshing exercise database:', error);
    }
}

export function fillTemplateValues() {
    // Fill in any missing template values with defaults
    if (AppState.workoutPlans) {
        AppState.workoutPlans.forEach(plan => {
            if (plan.exercises) {
                plan.exercises.forEach(exercise => {
                    exercise.sets = exercise.sets || 3;
                    exercise.reps = exercise.reps || 10;
                    exercise.weight = exercise.weight || 50;
                });
            }
        });
    }
    
    console.log(' Template values filled with defaults');
}

// ===================================================================
// IN-PROGRESS WORKOUT CHECK
// ===================================================================

async function checkForInProgressWorkoutEnhanced() {
    console.log(' Checking for in-progress workout...');
    
    try {
        const { loadTodaysWorkout } = await import('./data-manager.js');
        const todaysData = await loadTodaysWorkout(AppState);
        
        if (todaysData && !todaysData.completedAt && !todaysData.cancelledAt) {
            console.log(' Found in-progress workout:', todaysData.workoutType);
            
            // NOW workout plans will be available!
            console.log('Available workout plans:', AppState.workoutPlans.length);
            
            // Validate workout plan exists
            const workoutPlan = AppState.workoutPlans.find(plan => 
                plan.day === todaysData.workoutType || 
                plan.name === todaysData.workoutType ||
                plan.id === todaysData.workoutType
            );
            
            if (!workoutPlan) {
                console.warn(' Workout plan not found for:', todaysData.workoutType);
                console.log('Available plans:', AppState.workoutPlans.map(p => p.day || p.name));
                return;
            }
            
            // Store in-progress workout globally
            window.inProgressWorkout = {
                ...todaysData,
                originalWorkout: workoutPlan
            };
            
            // Show in-progress workout prompt
            showInProgressWorkoutPrompt(todaysData);
            
        } else {
            console.log(' No in-progress workout found');
        }
        
    } catch (error) {
        console.error(' Error checking for in-progress workout:', error);
    }
}

function showInProgressWorkoutPrompt(workoutData) {
    if (window.showingProgressPrompt) return;
    window.showingProgressPrompt = true;
    
    console.log(' Showing resume workout card for:', workoutData.workoutType);
    
    // Update card elements
    const card = document.getElementById('resume-workout-banner');
    const nameElement = document.getElementById('resume-workout-name');
    const setsElement = document.getElementById('resume-sets-completed');
    const timeElement = document.getElementById('resume-time-ago');
    
    if (card && nameElement) {
        // Set workout name
        nameElement.textContent = workoutData.workoutType;
        
        // Calculate sets completed
        let completedSets = 0;
        let totalSets = 0;
        if (workoutData.exercises) {
            Object.keys(workoutData.exercises).forEach(key => {
                const exercise = workoutData.exercises[key];
                if (exercise && exercise.sets) {
                    exercise.sets.forEach(set => {
                        totalSets++;
                        if (set.reps && set.weight) completedSets++;
                    });
                }
            });
        }
        if (setsElement) {
            setsElement.textContent = `${completedSets}/${totalSets}`;
        }
        
        // Calculate time ago
        if (timeElement && workoutData.startedAt) {
            const startTime = new Date(workoutData.startedAt);
            const now = new Date();
            const diffMs = now - startTime;
            const diffMins = Math.floor(diffMs / 60000);
            
            let timeAgo;
            if (diffMins < 1) timeAgo = 'just now';
            else if (diffMins < 60) timeAgo = `${diffMins}m ago`;
            else if (diffMins < 1440) timeAgo = `${Math.floor(diffMins / 60)}h ago`;
            else timeAgo = `${Math.floor(diffMins / 1440)}d ago`;
            
            timeElement.textContent = timeAgo;
        }
        
        // Show the card
        card.classList.remove('hidden');
        
        // Scroll to top so card is visible
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        // Fallback to old confirm dialog if card elements not found
        console.warn('Resume card elements not found, using fallback confirm dialog');
        const workoutDate = new Date(workoutData.date).toLocaleDateString();
        const message = `You have an in-progress "${workoutData.workoutType}" workout from ${workoutDate}.\n\nWould you like to continue where you left off?`;
        
        setTimeout(() => {
            if (confirm(message)) {
                import('./workout-core.js').then(module => {
                    module.continueInProgressWorkout();
                });
            } else {
                import('./workout-core.js').then(module => {
                    module.discardInProgressWorkout();
                });
            }
            window.showingProgressPrompt = false;
        }, 1000);
    }
}

// ===================================================================
// GLOBAL EVENT LISTENERS
// ===================================================================

export function setupEventListeners() {
    console.log(' Setting up global event listeners...');
    
    // Wait a bit for DOM to be fully ready
    setTimeout(() => {
        setupSignInListeners();
    }, 500);
    
    // Set up other listeners immediately
    setupOtherEventListeners();
}

function setupSignInListeners() {
    console.log(' Setting up sign-in listeners...');

    // Set up listeners for ALL sign-in buttons (loading screen + main auth section)
    const signInButtons = document.querySelectorAll('#sign-in-btn, #loading-signin-btn');
    console.log(` Found ${signInButtons.length} sign-in button(s)`);

    signInButtons.forEach((btn, index) => {
        console.log(` ${index + 1}. ID: "${btn.id}", Visible: ${!btn.classList.contains('hidden')}`);

        // Remove any existing onclick
        btn.onclick = null;

        // Add click event listener
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log(` Sign-in button #${index + 1} (${btn.id}) clicked`);

            if (typeof window.signIn === 'function') {
                window.signIn();
            } else {
                console.error(' window.signIn is not a function');
            }
        });
    });

    if (signInButtons.length === 0) {
        console.warn(' No sign-in buttons found');
    }

    // Sign-out button
    const signOutBtn = document.getElementById('sign-out-btn');
    if (signOutBtn) {
        console.log(' Sign-out button found, adding event listener');
        signOutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log(' Sign-out button clicked');
            signOutUser();
        });
    }
    
    // Debug: Check user info elements
    const userInfo = document.getElementById('user-info');
    console.log(' User info element:', { found: !!userInfo, hidden: userInfo?.classList.contains('hidden'),
        display: userInfo ? window.getComputedStyle(userInfo).display : 'N/A'
    });
}

function setupOtherEventListeners() {
    // Global unit toggle
    const globalUnitToggle = document.querySelector('.global-settings .unit-toggle');
    if (globalUnitToggle) {
        globalUnitToggle.addEventListener('click', (e) => {
            if (e.target.classList.contains('unit-btn')) {
                import('./workout-core.js').then(module => {
                    module.setGlobalUnit(e.target.dataset.unit);
                });
            }
        });
    }
    
    // Close modal buttons
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('close-modal') || e.target.closest('.close-modal')) {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.classList.add('hidden');
            }
        }
    });
    
    // Close modal on backdrop click
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.add('hidden');
        }
    });
    
    // ESC key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal:not(.hidden)');
            if (activeModal) {
                activeModal.classList.add('hidden');
            }
        }
    });

    // Click outside modal to close (backdrop click)
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.add('hidden');
        }
    });

    console.log(' Other event listeners setup complete');
}

export function setupKeyboardShortcuts() {
    console.log(' Setting up keyboard shortcuts...');
    
    document.addEventListener('keydown', (e) => {
        // Don't trigger shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // Ctrl/Cmd + K for search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('workout-search') || 
                              document.getElementById('exercise-search');
            if (searchInput) {
                searchInput.focus();
            }
        }
        
        // Space to pause/resume timer
        if (e.key === ' ' && AppState.globalRestTimer) {
            e.preventDefault();
            // Toggle timer pause (would need to implement pause functionality)
        }
        
        // ESC to close any open modals
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal:not(.hidden)');
            if (activeModal) {
                e.preventDefault();
                activeModal.classList.add('hidden');
            }
        }
    });
    
    console.log(' Keyboard shortcuts setup complete');
}

// ===================================================================
// WORKOUT SELECTOR SETUP
// ===================================================================

function setupWorkoutFilters() {
    const filterButtons = document.querySelectorAll('.workout-filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const category = e.target.dataset.category;
            filterWorkoutsByCategory(category);
        });
    });
}

function setupWorkoutSearch() {
    const searchInput = document.getElementById('workout-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounceWorkoutSearch);
    }
}

function filterWorkoutsByCategory(category) {
    // Update active filter
    document.querySelectorAll('.workout-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    
    // Import and use template selection module
    import('./template-selection.js').then(module => {
        module.filterTemplates(category);
    });
}

function debounceWorkoutSearch(event) {
    clearTimeout(debounceWorkoutSearch.timeout);
    debounceWorkoutSearch.timeout = setTimeout(() => {
        const query = event.target.value;
        
        // Import and use template selection module
        import('./template-selection.js').then(module => {
            module.searchTemplates(query);
        });
    }, 300);
}

function renderInitialWorkouts() {
    // Import and use template selection module
    import('./template-selection.js').then(module => {
        module.loadTemplatesByCategory();
    });
}

// ===================================================================
// GLOBAL SETUP HELPERS
// ===================================================================

export function setupGlobalVariables() {
    // Initialize any global variables that need setup
    window.showingProgressPrompt = false;
    window.historyListenersSetup = false;
    
    console.log(' Global variables initialized');
}

export function initializeModules() {
    try {
        // Initialize workout management
        initializeWorkoutManagement(AppState);
        
        // Set up date display
        setTodayDisplay();
        
        console.log(' All modules initialized successfully');
        
    } catch (error) {
        console.error(' Error initializing modules:', error);
        showNotification('Some features may not work properly', 'warning');
    }
}

// ===================================================================
// MAIN ENTRY POINT
// ===================================================================

export function startApplication() {
    console.log(' Starting Big Surf Workout Tracker application...');

    // Register service worker for PWA functionality
    registerServiceWorker();

    // Set up global variables
    setupGlobalVariables();

    // Initialize core app
    initializeWorkoutApp();

    // Set up event listeners
    setupEventListeners();
    setupKeyboardShortcuts();

    // Initialize UI modules
    initializeModules();

    // Initialize enhanced workout selector
    initializeEnhancedWorkoutSelector();

    console.log(' Application started successfully!');
}

// ===================================================================
// SERVICE WORKER REGISTRATION
// ===================================================================

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then((registration) => {
                    console.log(' Service Worker registered:', registration.scope);

                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        console.log(' Service Worker update found');

                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // New service worker available, show update notification
                                showNotification('App update available! Refresh to update.', 'info');
                            }
                        });
                    });
                })
                .catch((error) => {
                    console.log(' Service Worker registration failed:', error);
                });
        });
    } else {
        console.log(' Service Workers not supported in this browser');
    }
}