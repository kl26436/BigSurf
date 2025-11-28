// Enhanced Firebase Workout Manager - js/core/firebase-workout-manager.js
// Replace your existing firebase-workout-manager.js with this version

import { 
    db, doc, setDoc, getDoc, deleteDoc, collection, query, where, 
    getDocs, orderBy, limit, onSnapshot 
} from './firebase-config.js';
import { writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showNotification } from './ui-helpers.js';

export class FirebaseWorkoutManager {
    constructor(appState) {
        this.appState = appState;
        this.db = db;
        this.exerciseListeners = new Set();
        this.workoutListeners = new Set();
    }

    // ===== UNIVERSAL EXERCISE MANAGEMENT =====
    
    /**
     * Get complete exercise library with user overrides applied
     * This is the main method that replaces getExerciseLibrary()
     */
    async getExerciseLibrary() {
        try {
            console.log(' Loading universal exercise library...');
            
            if (!this.appState.currentUser) {
                console.log(' No user signed in, loading default exercises only');
                return await this.getDefaultExercisesOnly();
            }

            // 1. Load base default exercises
            const defaultExercises = await this.getDefaultExercises();
            
            // 2. Load user's custom exercises  
            const customExercises = await this.getCustomExercises();
            
            // 3. Load user's exercise overrides
            const userOverrides = await this.getUserExerciseOverrides();
            
            // 4. Load hidden exercises
            const hiddenExercises = await this.getHiddenExercises();
            
            // 5. Apply overrides and filter hidden exercises
            let finalExercises = this.mergeExercisesWithOverrides(
                defaultExercises, 
                customExercises, 
                userOverrides
            );
            
            // 6. Filter out hidden exercises
            finalExercises = this.filterHiddenExercises(finalExercises, hiddenExercises);
            
            console.log(` Universal library: ${defaultExercises.length} default + ${customExercises.length} custom + ${userOverrides.length} overrides - ${hiddenExercises.length} hidden = ${finalExercises.length} total`);
            
            return finalExercises;
            
        } catch (error) {
            console.error('❌ Error loading universal exercise library:', error);
            showNotification('Error loading exercise library, using fallback', 'warning');
            return await this.getDefaultExercisesOnly();
        }
    }

    /**
     * Universal save method - handles all exercise types
     */
    async saveUniversalExercise(exerciseData, isEditing = false) {
        if (!this.appState.currentUser) {
            throw new Error('Must be signed in to save exercises');
        }

        try {
            console.log(' Saving universal exercise:', exerciseData.name, 'isEditing:', isEditing);
            
            // Determine save strategy
            const isDefaultOverride = exerciseData.isDefault && isEditing && !exerciseData.isOverride;
            const isExistingOverride = exerciseData.isOverride && isEditing;
            const isCustomExercise = exerciseData.isCustom || (!exerciseData.isDefault && !exerciseData.isOverride);
            
            if (isDefaultOverride) {
                // Create user override for default exercise
                console.log(' Creating user override for default exercise');
                return await this.createUserOverride(exerciseData);
            } else if (isExistingOverride) {
                // Update existing override
                console.log(' Updating existing override');
                return await this.updateUserOverride(exerciseData);
            } else if (isCustomExercise) {
                // Handle custom exercise
                console.log(' Handling custom exercise');
                return await this.saveCustomExercise(exerciseData, isEditing);
            } else {
                // New custom exercise
                console.log(' Creating new custom exercise');
                return await this.saveCustomExercise(exerciseData, false);
            }
            
        } catch (error) {
            console.error('❌ Error saving universal exercise:', error);
            showNotification(`Error saving "${exerciseData.name}"`, 'error');
            throw error;
        }
    }

    /**
     * Create user override for a default exercise
     */
    async createUserOverride(exerciseData) {
        try {
            console.log(` Creating user override for: ${exerciseData.name}`);
            
            const overrideId = exerciseData.id || exerciseData.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "exerciseOverrides", overrideId);
            
            const overrideData = {
                originalId: exerciseData.id,
                originalName: exerciseData.name,
                name: exerciseData.name,
                bodyPart: exerciseData.bodyPart,
                equipmentType: exerciseData.equipmentType,
                sets: exerciseData.sets,
                reps: exerciseData.reps,
                weight: exerciseData.weight,
                video: exerciseData.video,
                tags: exerciseData.tags || [],
                isDefault: false,        
                isCustom: false,         
                isOverride: true,        
                overrideCreated: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                createdBy: this.appState.currentUser.uid
            };
            
            await setDoc(docRef, overrideData);
            
            console.log(`✅ User override created for "${exerciseData.name}"`);
            
            return overrideId;
            
        } catch (error) {
            console.error('❌ Error creating user override:', error);
            throw error;
        }
    }

    /**
     * Update existing user override
     */
    async updateUserOverride(exerciseData) {
        try {
            const overrideId = exerciseData.id;
            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "exerciseOverrides", overrideId);
            
            const updateData = {
                ...exerciseData,
                lastUpdated: new Date().toISOString(),
                isOverride: true
            };
            
            await setDoc(docRef, updateData, { merge: true });
            
            console.log(`✅ User override updated: ${exerciseData.name}`);
            
            return overrideId;
            
        } catch (error) {
            console.error('❌ Error updating user override:', error);
            throw error;
        }
    }

    /**
     * Get user's exercise overrides
     */
    async getUserExerciseOverrides() {
        if (!this.appState.currentUser) {
            return [];
        }
        
        try {
            const overridesRef = collection(this.db, "users", this.appState.currentUser.uid, "exerciseOverrides");
            const querySnapshot = await getDocs(overridesRef);
            
            const overrides = [];
            querySnapshot.forEach((doc) => {
                overrides.push({ 
                    id: doc.id, 
                    ...doc.data(),
                    isOverride: true
                });
            });
            
            console.log(` Loaded ${overrides.length} user exercise overrides`);
            return overrides;
            
        } catch (error) {
            console.error('❌ Error loading user overrides:', error);
            return [];
        }
    }

    /**
     * Merge exercises with user overrides applied
     */
    mergeExercisesWithOverrides(defaultExercises, customExercises, userOverrides) {
        // Create lookup maps for overrides
        const overrideByOriginalId = new Map();
        const overrideByOriginalName = new Map();
        
        userOverrides.forEach(override => {
            if (override.originalId) {
                overrideByOriginalId.set(override.originalId, override);
            }
            if (override.originalName) {
                overrideByOriginalName.set(override.originalName.toLowerCase(), override);
            }
        });

        // Apply overrides to default exercises
        const mergedDefaults = defaultExercises.map(exercise => {
            const overrideById = overrideByOriginalId.get(exercise.id);
            const overrideByName = overrideByOriginalName.get(exercise.name?.toLowerCase());
            const override = overrideById || overrideByName;
            
            if (override) {
                console.log(` Applying override for: ${exercise.name} -> ${override.name}`);
                return { 
                    ...exercise, 
                    ...override, 
                    isOverridden: true,
                    originalData: exercise // Keep reference to original
                };
            }
            return exercise;
        });

        // Combine all exercises
        return [...mergedDefaults, ...customExercises];
    }

    /**
     * Universal delete method
     */
    async deleteUniversalExercise(exerciseId, exerciseData) {
        if (!this.appState.currentUser) {
            throw new Error('Must be signed in to delete exercises');
        }

        try {
            if (exerciseData.isOverride) {
                // Delete user override (reverts to default)
                await this.deleteUserOverride(exerciseId);
                console.log(`✅ Reverted "${exerciseData.name}" to default version`);
            } else if (exerciseData.isCustom) {
                // Delete custom exercise
                await this.deleteCustomExercise(exerciseId);
                console.log(`✅ Deleted custom exercise "${exerciseData.name}"`);
            } else if (exerciseData.isDefault) {
                // Hide default exercise
                await this.hideDefaultExercise(exerciseId, exerciseData);
                console.log(`✅ Hidden "${exerciseData.name}" from your library`);
            }
            
            return true;
            
        } catch (error) {
            console.error('❌ Error deleting exercise:', error);
            throw error;
        }
    }

    /**
     * Delete user override (reverts to default)
     */
    async deleteUserOverride(overrideId) {
        const docRef = doc(this.db, "users", this.appState.currentUser.uid, "exerciseOverrides", overrideId);
        await deleteDoc(docRef);
        console.log(` Deleted user override: ${overrideId}`);
    }

    /**
     * Hide default exercise from user's view
     */
    async hideDefaultExercise(exerciseId, exerciseData) {
        const hideId = exerciseId || exerciseData.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const docRef = doc(this.db, "users", this.appState.currentUser.uid, "hiddenExercises", hideId);
        
        await setDoc(docRef, {
            originalId: exerciseId,
            originalName: exerciseData.name,
            hiddenAt: new Date().toISOString(),
            reason: 'user_hidden'
        });
        
        console.log(` Hidden default exercise: ${exerciseData.name}`);
    }

    /**
     * Get user's hidden exercises
     */
    async getHiddenExercises() {
        if (!this.appState.currentUser) {
            return [];
        }
        
        try {
            const hiddenRef = collection(this.db, "users", this.appState.currentUser.uid, "hiddenExercises");
            const querySnapshot = await getDocs(hiddenRef);
            
            const hidden = [];
            querySnapshot.forEach((doc) => {
                hidden.push(doc.data());
            });
            
            return hidden;
            
        } catch (error) {
            console.error('❌ Error loading hidden exercises:', error);
            return [];
        }
    }

    /**
     * Filter out hidden exercises
     */
    filterHiddenExercises(exercises, hiddenExercises) {
        if (hiddenExercises.length === 0) return exercises;
        
        const hiddenIds = new Set();
        const hiddenNames = new Set();
        
        hiddenExercises.forEach(hidden => {
            if (hidden.originalId) hiddenIds.add(hidden.originalId);
            if (hidden.originalName) hiddenNames.add(hidden.originalName.toLowerCase());
        });
        
        return exercises.filter(exercise => {
            const isHiddenById = hiddenIds.has(exercise.id);
            const isHiddenByName = hiddenNames.has(exercise.name?.toLowerCase());
            return !isHiddenById && !isHiddenByName;
        });
    }

    // ===== TRADITIONAL EXERCISE METHODS (for compatibility) =====
    
    async getDefaultExercises() {
        try {
            console.log(' Loading default exercises from Firebase...');
            const exercisesRef = collection(this.db, 'exercises');
            const querySnapshot = await getDocs(exercisesRef);
            
            const exercises = [];
            querySnapshot.forEach((doc) => {
                if (doc.id !== 'default') { // Skip metadata
                    const data = doc.data();
                    if (data.name || data.machine) { // Validate exercise
                        exercises.push({ 
                            id: doc.id, 
                            name: data.name || data.machine,
                            machine: data.machine || data.name,
                            bodyPart: data.bodyPart || 'General',
                            equipmentType: data.equipmentType || data.equipment || 'Machine',
                            sets: data.sets || 3,
                            reps: data.reps || 10,
                            weight: data.weight || 50,
                            video: data.video || '',
                            tags: data.tags || [],
                            isDefault: true,
                            isCustom: false
                        });
                    }
                }
            });
            
            console.log(` Loaded ${exercises.length} default exercises from Firebase`);
            return exercises;
            
        } catch (error) {
            console.error('❌ Error loading default exercises from Firebase:', error);
            return await this.getDefaultExercisesOnly();
        }
    }

    async getCustomExercises() {
        if (!this.appState.currentUser) {
            return [];
        }
        
        try {
            const customRef = collection(this.db, "users", this.appState.currentUser.uid, "customExercises");
            const querySnapshot = await getDocs(customRef);
            
            const customExercises = [];
            querySnapshot.forEach((doc) => {
                customExercises.push({ 
                    id: doc.id, 
                    ...doc.data(), 
                    isCustom: true,
                    isDefault: false
                });
            });
            
            console.log(` Loaded ${customExercises.length} custom exercises`);
            return customExercises;
            
        } catch (error) {
            console.error('❌ Error loading custom exercises:', error);
            return [];
        }
    }

    async saveCustomExercise(exerciseData, isEditing = false) {
        if (!this.appState.currentUser) {
            throw new Error('Must be signed in to save custom exercises');
        }
        
        try {
            const exerciseId = isEditing && exerciseData.id ? 
                exerciseData.id : 
                `custom_${exerciseData.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_${Date.now()}`;
                
            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "customExercises", exerciseId);
            
            const exerciseToSave = {
                name: exerciseData.name,
                machine: exerciseData.machine || exerciseData.name,
                bodyPart: exerciseData.bodyPart,
                equipmentType: exerciseData.equipmentType,
                sets: exerciseData.sets,
                reps: exerciseData.reps,
                weight: exerciseData.weight,
                video: exerciseData.video || '',
                tags: exerciseData.tags || [],
                id: exerciseId,
                isCustom: true,
                isDefault: false,
                createdBy: this.appState.currentUser.uid,
                [isEditing ? 'lastUpdated' : 'createdAt']: new Date().toISOString()
            };
            
            await setDoc(docRef, exerciseToSave);
            
            const action = isEditing ? 'Updated' : 'Created';
            console.log(`✅ ${action} custom exercise: ${exerciseData.name}`);
            
            return exerciseId;
            
        } catch (error) {
            console.error('❌ Error saving custom exercise:', error);
            throw error;
        }
    }

    async updateCustomExercise(exerciseId, exerciseData) {
        return await this.saveCustomExercise({ ...exerciseData, id: exerciseId }, true);
    }

    async deleteCustomExercise(exerciseId) {
        if (!this.appState.currentUser) {
            throw new Error('Must be signed in to delete custom exercises');
        }
        
        const docRef = doc(this.db, "users", this.appState.currentUser.uid, "customExercises", exerciseId);
        await deleteDoc(docRef);
        console.log(` Deleted custom exercise: ${exerciseId}`);
    }

    async getDefaultExercisesOnly() {
        // Fallback to JSON or hardcoded defaults
        try {
            const response = await fetch('./data/exercises.json');
            if (response.ok) {
                const exercises = await response.json();
                return exercises.map(ex => ({ 
                    ...ex, 
                    name: ex.name || ex.machine,
                    machine: ex.machine || ex.name,
                    isDefault: true, 
                    isCustom: false 
                }));
            }
        } catch (error) {
            console.error('❌ Error loading fallback exercises:', error);
        }
        
        // Ultimate fallback
        return [
            {
                id: 'fallback_1',
                name: 'Bench Press',
                machine: 'Bench Press',
                bodyPart: 'Chest',
                equipmentType: 'Barbell',
                sets: 3,
                reps: 10,
                weight: 135,
                video: '',
                isDefault: true,
                isCustom: false,
                tags: ['chest', 'compound']
            }
        ];
    }

    // ===== WORKOUT TEMPLATE MANAGEMENT =====
    
    async getWorkoutTemplates() {
    console.log(' getWorkoutTemplates: Loading defaults for AppState.workoutPlans...');
    
    // For AppState.workoutPlans, we ONLY want global default templates
    const defaultTemplates = await this.getGlobalDefaultTemplates();
    
    console.log(` getWorkoutTemplates: Returning ${defaultTemplates.length} global defaults for AppState`);
    return defaultTemplates;
}

async getGlobalDefaultTemplates() {
    try {
        console.log(' Loading global default templates from Firebase workouts collection...');
        
        // Load from your existing 'workouts' collection
        const globalDefaultsRef = collection(this.db, "workouts");
        const querySnapshot = await getDocs(globalDefaultsRef);
        
        const globalDefaults = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            globalDefaults.push({ 
                id: doc.id, 
                ...data,
                // Ensure consistent naming
                name: data.day || data.name || doc.id,
                isDefault: true,
                isCustom: false,
                source: 'global-firebase'
            });
        });
        
        console.log(` Loaded ${globalDefaults.length} global default templates from workouts collection`);
        
        if (globalDefaults.length === 0) {
            console.warn('⚠️ No global default templates found in workouts collection.');
        }
        
        return globalDefaults;
        
    } catch (error) {
        console.error('❌ Error loading global default templates:', error);
        
        // Return empty array - no JSON fallback
        console.log(' Returning empty array - no fallback to JSON');
        return [];
    }
}
    async getTemplatesByCategory(category) {
    try {
        console.log(` Loading templates for category: ${category}`);
        
        if (category === 'default') {
            // Load ONLY global default templates
            const defaultTemplates = await this.getGlobalDefaultTemplates();
            
            console.log(` Loaded ${defaultTemplates.length} global default templates`);
            return defaultTemplates;
            
        } else if (category === 'custom') {
            // Load ONLY user-specific custom templates
            if (!this.appState.currentUser) {
                console.log(' No user signed in for custom templates');
                return [];
            }
            
            const customTemplatesRef = collection(this.db, "users", this.appState.currentUser.uid, "workoutTemplates");
            const querySnapshot = await getDocs(customTemplatesRef);
            
            const customTemplates = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                customTemplates.push({ 
                    id: doc.id, 
                    ...data,
                    isCustom: true,
                    isDefault: false,
                    source: 'user-firebase'
                });
            });
            
            console.log(` Loaded ${customTemplates.length} user custom templates`);
            return customTemplates;
            
        } else {
            // For workout categories (Push, Pull, Legs, etc.), load all and filter
            const allTemplates = await this.getUserWorkoutTemplates();
            const filteredTemplates = allTemplates.filter(template => 
                template.category === category || 
                (template.day && this.getWorkoutCategory(template.day) === category)
            );
            
            console.log(` Loaded ${filteredTemplates.length} templates for category: ${category}`);
            return filteredTemplates;
        }
        
    } catch (error) {
        console.error(`❌ Error loading templates for category ${category}:`, error);
        return [];
    }
}


    // Helper method to determine workout category from day name
    getWorkoutCategory(dayName) {
        if (!dayName) return 'Other';
        
        const dayLower = dayName.toLowerCase();
        
        if (dayLower.includes('push') || dayLower.includes('chest')) {
            return 'Push';
        } else if (dayLower.includes('pull') || dayLower.includes('back')) {
            return 'Pull';
        } else if (dayLower.includes('leg') || dayLower.includes('lower')) {
            return 'Legs';
        } else if (dayLower.includes('cardio') || dayLower.includes('core')) {
            return 'Cardio';
        } else {
            return 'Other';
        }
    }

        async getUserWorkoutTemplates() {
        try {
            console.log(' Loading all user workout templates...');
            
            // Load global defaults
            const defaultTemplates = await this.getGlobalDefaultTemplates();
            
            // Load user customs (only if signed in)
            let customTemplates = [];
            if (this.appState.currentUser) {
                const customTemplatesRef = collection(this.db, "users", this.appState.currentUser.uid, "workoutTemplates");
                const customSnapshot = await getDocs(customTemplatesRef);
                
                customSnapshot.forEach((doc) => {
                    customTemplates.push({ 
                        id: doc.id, 
                        ...doc.data(),
                        isCustom: true,
                        isDefault: false,
                        source: 'user-firebase'
                    });
                });
            }
            
            const allTemplates = [...defaultTemplates, ...customTemplates];
            
            console.log(` getUserWorkoutTemplates: ${defaultTemplates.length} global defaults + ${customTemplates.length} user customs = ${allTemplates.length} total`);
            
            return allTemplates;
            
        } catch (error) {
            console.error('❌ Error loading user workout templates:', error);
            return [];
        }
    }

        async getMigratedDefaultWorkouts() {
        // Simply return the global defaults
        return await this.getGlobalDefaultTemplates();
    }

    async saveWorkoutTemplate(templateData) {
        if (!this.appState.currentUser) {
            throw new Error('User must be signed in to save workout templates');
        }
        
        try {
            const templateId = templateData.id || templateData.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "workoutTemplates", templateId);
            
            const templateToSave = {
                ...templateData,
                id: templateId,
                lastUpdated: new Date().toISOString(),
                createdBy: this.appState.currentUser.uid,
                isCustom: true,
                isDefault: false
            };
            
            await setDoc(docRef, templateToSave);
            
            console.log(`✅ Workout template "${templateData.name}" saved`);

            return templateId;
            
        } catch (error) {
            console.error('❌ Error saving workout template:', error);
            showNotification('Failed to save workout template', 'error');
            throw error;
        }
    }

    async updateWorkoutTemplate(templateId, templateData) {
        if (!this.appState.currentUser) {
            throw new Error('User must be signed in to update workout templates');
        }
        
        try {
            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "workoutTemplates", templateId);
            
            const updateData = {
                ...templateData,
                lastUpdated: new Date().toISOString(),
                isCustom: true
            };
            
            await setDoc(docRef, updateData, { merge: true });
            
            console.log(`✅ Workout template updated: ${templateId}`);

            return true;
            
        } catch (error) {
            console.error('❌ Error updating workout template:', error);
            showNotification('Failed to update workout template', 'error');
            throw error;
        }
    }

    async deleteWorkoutTemplate(templateId) {
        if (!this.appState.currentUser) {
            throw new Error('User must be signed in to delete workout templates');
        }
        
        try {
            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "workoutTemplates", templateId);
            await deleteDoc(docRef);
            
            console.log(`✅ Workout template deleted: ${templateId}`);

            return true;
            
        } catch (error) {
            console.error('❌ Error deleting workout template:', error);
            showNotification('Failed to delete workout template', 'error');
            throw error;
        }
    }

    // ===== WORKOUT MANAGEMENT =====
    
    async saveWorkout(workoutData) {
        if (!this.appState.currentUser) {
            throw new Error('User must be signed in to save workouts');
        }
        
        try {
            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "workouts", workoutData.date);
            await setDoc(docRef, workoutData);
            console.log(` Workout saved for ${workoutData.date}`);
            return true;
        } catch (error) {
            console.error('❌ Error saving workout:', error);
            throw error;
        }
    }

    async getUserWorkouts() {
        if (!this.appState.currentUser) {
            return [];
        }

        try {
            const workoutsRef = collection(this.db, "users", this.appState.currentUser.uid, "workouts");
            const q = query(workoutsRef, orderBy("date", "desc"));
            const querySnapshot = await getDocs(q);

            const workouts = [];
            querySnapshot.forEach((doc) => {
                const workoutData = { id: doc.id, ...doc.data() };
                // Filter out cancelled workouts - they shouldn't appear in history
                if (!workoutData.cancelledAt) {
                    workouts.push(workoutData);
                }
            });

            return workouts;
        } catch (error) {
            console.error('❌ Error loading user workouts:', error);
            return [];
        }
    }

    // Legacy method names for compatibility
    async createExercise(exerciseData) {
        return await this.saveCustomExercise(exerciseData);
    }

    searchExercises(exercises, searchQuery, filters = {}) {
        if (!exercises || exercises.length === 0) return [];

        let filtered = [...exercises];

        // Apply search query
        if (searchQuery && searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            filtered = filtered.filter(ex => {
                const name = (ex.name || ex.machine || '').toLowerCase();
                const bodyPart = (ex.bodyPart || '').toLowerCase();
                const equipment = (ex.equipmentType || '').toLowerCase();
                return name.includes(query) || bodyPart.includes(query) || equipment.includes(query);
            });
        }

        // Apply body part filter
        if (filters.bodyPart) {
            filtered = filtered.filter(ex =>
                (ex.bodyPart || '').toLowerCase() === filters.bodyPart.toLowerCase()
            );
        }

        // Apply equipment filter
        if (filters.equipment) {
            filtered = filtered.filter(ex =>
                (ex.equipmentType || '').toLowerCase() === filters.equipment.toLowerCase()
            );
        }

        return filtered;
    }

    // REMOVED: swapExercise() method - Replaced by delete + add workflow
}

// For backward compatibility
export { FirebaseWorkoutManager as WorkoutManager };