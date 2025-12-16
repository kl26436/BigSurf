// Enhanced Firebase Workout Manager - js/core/firebase-workout-manager.js
// Replace your existing firebase-workout-manager.js with this version

import {
    db, doc, setDoc, getDoc, deleteDoc, collection, query, where,
    getDocs, getDocsFromServer, orderBy, limit, onSnapshot
} from './firebase-config.js';
import { writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showNotification } from '../ui/ui-helpers.js';

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
            
            if (!this.appState.currentUser) {
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
            
            // Determine save strategy
            const isDefaultOverride = exerciseData.isDefault && isEditing && !exerciseData.isOverride;
            const isExistingOverride = exerciseData.isOverride && isEditing;
            const isCustomExercise = exerciseData.isCustom || (!exerciseData.isDefault && !exerciseData.isOverride);
            
            if (isDefaultOverride) {
                // Create user override for default exercise
                return await this.createUserOverride(exerciseData);
            } else if (isExistingOverride) {
                // Update existing override
                return await this.updateUserOverride(exerciseData);
            } else if (isCustomExercise) {
                // Handle custom exercise
                return await this.saveCustomExercise(exerciseData, isEditing);
            } else {
                // New custom exercise
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
            
            const overrideId = exerciseData.id || exerciseData.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "exerciseOverrides", overrideId);
            
            const overrideData = {
                originalId: exerciseData.id,
                originalName: exerciseData.name,
                name: exerciseData.name,
                bodyPart: exerciseData.bodyPart,
                equipmentType: exerciseData.equipmentType,
                equipment: exerciseData.equipment || null,
                equipmentLocation: exerciseData.equipmentLocation || null,
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
            } else if (exerciseData.isCustom) {
                // Delete custom exercise
                await this.deleteCustomExercise(exerciseId);
            } else if (exerciseData.isDefault) {
                // Hide default exercise
                await this.hideDefaultExercise(exerciseId, exerciseData);
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
            const exercisesRef = collection(this.db, 'exercises');
            const querySnapshot = await getDocs(exercisesRef);

            const exercises = [];
            const seenNames = new Set(); // Track names to filter duplicates

            querySnapshot.forEach((doc) => {
                if (doc.id !== 'default') { // Skip metadata
                    const data = doc.data();
                    if (data.name || data.machine) { // Validate exercise
                        const name = (data.name || data.machine).toLowerCase();

                        // Skip if we've already seen this exercise name (dedup)
                        if (seenNames.has(name)) {
                            return;
                        }
                        seenNames.add(name);

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
            // Check for existing exercise with same name (to prevent duplicates)
            if (!isEditing) {
                const existingExercises = await this.getCustomExercises();
                const existingByName = existingExercises.find(ex =>
                    ex.name?.toLowerCase() === exerciseData.name?.toLowerCase()
                );
                if (existingByName) {
                    // Update existing instead of creating duplicate
                    console.log('📊 Found existing custom exercise, updating instead of creating duplicate');
                    return await this.saveCustomExercise({ ...exerciseData, id: existingByName.id }, true);
                }
            }

            const exerciseId = isEditing && exerciseData.id ?
                exerciseData.id :
                `custom_${exerciseData.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_${Date.now()}`;

            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "customExercises", exerciseId);
            
            const exerciseToSave = {
                name: exerciseData.name,
                machine: exerciseData.machine || exerciseData.name,
                bodyPart: exerciseData.bodyPart,
                equipmentType: exerciseData.equipmentType,
                equipment: exerciseData.equipment || null,
                equipmentLocation: exerciseData.equipmentLocation || null,
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
    
    // For AppState.workoutPlans, we ONLY want global default templates
    const defaultTemplates = await this.getGlobalDefaultTemplates();
    return defaultTemplates;
}

async getGlobalDefaultTemplates() {
    try {
        
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
        
        if (globalDefaults.length === 0) {
            console.warn('⚠️ No global default templates found in workouts collection.');
        }
        
        return globalDefaults;
        
    } catch (error) {
        console.error('❌ Error loading global default templates:', error);
        
        // Return empty array - no JSON fallback
        return [];
    }
}
    async getTemplatesByCategory(category) {
    try {
        
        if (category === 'default') {
            // Load ONLY global default templates
            const defaultTemplates = await this.getGlobalDefaultTemplates();
            return defaultTemplates;
            
        } else if (category === 'custom') {
            // Load ONLY user-specific custom templates
            if (!this.appState.currentUser) {
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
            return customTemplates;
            
        } else {
            // For workout categories (Push, Pull, Legs, etc.), load all and filter
            const allTemplates = await this.getUserWorkoutTemplates();
            const filteredTemplates = allTemplates.filter(template => 
                template.category === category || 
                (template.day && this.getWorkoutCategory(template.day) === category)
            );
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

            // Load global defaults
            const defaultTemplates = await this.getGlobalDefaultTemplates();

            // Load user customs and overrides (only if signed in)
            let customTemplates = [];
            const overriddenDefaultIds = new Set();

            if (this.appState.currentUser) {
                const customTemplatesRef = collection(this.db, "users", this.appState.currentUser.uid, "workoutTemplates");
                const customSnapshot = await getDocs(customTemplatesRef);

                customSnapshot.forEach((doc) => {
                    const data = doc.data();

                    // Skip hidden templates (they're just markers, not actual templates)
                    if (data.isHidden) {
                        // Track which defaults are hidden
                        if (data.overridesDefault) {
                            overriddenDefaultIds.add(data.overridesDefault);
                        }
                        return;
                    }

                    customTemplates.push({
                        id: doc.id,
                        ...data,
                        isCustom: true,
                        isDefault: false,
                        source: 'user-firebase'
                    });

                    // Track which defaults are overridden
                    if (data.overridesDefault) {
                        overriddenDefaultIds.add(data.overridesDefault);
                    }
                });
            }

            // Filter out defaults that have been overridden or hidden
            const visibleDefaults = defaultTemplates.filter(template =>
                !overriddenDefaultIds.has(template.id || template.day)
            );

            const allTemplates = [...visibleDefaults, ...customTemplates];

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

            // Remove undefined fields (Firebase doesn't allow them)
            Object.keys(templateToSave).forEach(key => {
                if (templateToSave[key] === undefined) {
                    delete templateToSave[key];
                }
            });

            await setDoc(docRef, templateToSave);

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
            // Use getDocsFromServer to bypass Firestore cache (ensures deleted docs don't reappear)
            const querySnapshot = await getDocsFromServer(q);

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

    // ===== EQUIPMENT MANAGEMENT =====

    /**
     * Save equipment to user's equipment collection
     * Used for tracking specific machines/equipment at gyms
     */
    async saveEquipment(equipmentData) {
        if (!this.appState.currentUser) {
            throw new Error('Must be signed in to save equipment');
        }

        try {
            const equipmentId = equipmentData.id ||
                `equipment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "equipment", equipmentId);

            const equipmentToSave = {
                id: equipmentId,
                name: equipmentData.name,
                location: equipmentData.location || null,
                exerciseTypes: equipmentData.exerciseTypes || [],
                createdAt: equipmentData.createdAt || new Date().toISOString(),
                lastUsed: new Date().toISOString()
            };

            await setDoc(docRef, equipmentToSave);
            return equipmentId;

        } catch (error) {
            console.error('❌ Error saving equipment:', error);
            throw error;
        }
    }

    /**
     * Get all user's saved equipment
     */
    async getUserEquipment() {
        if (!this.appState.currentUser) {
            return [];
        }

        try {
            const equipmentRef = collection(this.db, "users", this.appState.currentUser.uid, "equipment");
            const q = query(equipmentRef, orderBy("lastUsed", "desc"));
            const querySnapshot = await getDocs(q);

            const equipment = [];
            querySnapshot.forEach((doc) => {
                equipment.push({ id: doc.id, ...doc.data() });
            });

            return equipment;

        } catch (error) {
            console.error('❌ Error loading user equipment:', error);
            return [];
        }
    }

    /**
     * Get equipment used for a specific exercise type
     */
    async getEquipmentForExercise(exerciseName) {
        if (!this.appState.currentUser) {
            return [];
        }

        try {
            const allEquipment = await this.getUserEquipment();

            // Filter equipment that has been used with this exercise
            return allEquipment.filter(eq =>
                eq.exerciseTypes && eq.exerciseTypes.includes(exerciseName)
            );

        } catch (error) {
            console.error('❌ Error loading equipment for exercise:', error);
            return [];
        }
    }

    /**
     * Update equipment's last used timestamp and add exercise type if new
     */
    async updateEquipmentUsage(equipmentId, exerciseName) {
        if (!this.appState.currentUser || !equipmentId) {
            return;
        }

        try {
            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "equipment", equipmentId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                const exerciseTypes = data.exerciseTypes || [];

                // Add exercise type if not already in list
                if (!exerciseTypes.includes(exerciseName)) {
                    exerciseTypes.push(exerciseName);
                }

                await setDoc(docRef, {
                    ...data,
                    exerciseTypes: exerciseTypes,
                    lastUsed: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error('❌ Error updating equipment usage:', error);
        }
    }

    /**
     * Delete equipment from user's collection
     */
    async deleteEquipment(equipmentId) {
        if (!this.appState.currentUser) {
            throw new Error('Must be signed in to delete equipment');
        }

        try {
            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "equipment", equipmentId);
            await deleteDoc(docRef);
            return true;

        } catch (error) {
            console.error('❌ Error deleting equipment:', error);
            throw error;
        }
    }

    /**
     * Update equipment with new data
     * @param {string} equipmentId - Equipment document ID
     * @param {Object} updates - Fields to update (name, video, locations, etc.)
     */
    async updateEquipment(equipmentId, updates) {
        if (!this.appState.currentUser || !equipmentId) {
            throw new Error('Must be signed in to update equipment');
        }

        try {
            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "equipment", equipmentId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                throw new Error('Equipment not found');
            }

            const existingData = docSnap.data();

            // Merge updates with existing data
            const updatedData = {
                ...existingData,
                ...updates,
                lastUsed: new Date().toISOString()
            };

            await setDoc(docRef, updatedData);
            return true;

        } catch (error) {
            console.error('❌ Error updating equipment:', error);
            throw error;
        }
    }

    /**
     * Get or create equipment by name and optional location
     * Returns existing equipment if found (by name only), creates new if not
     * Equipment can have multiple locations, so we match by name only
     */
    async getOrCreateEquipment(equipmentName, location = null, exerciseName = null, videoUrl = null) {
        if (!this.appState.currentUser || !equipmentName) {
            return null;
        }

        try {
            const allEquipment = await this.getUserEquipment();

            // Look for existing equipment with same name (case-insensitive)
            const existing = allEquipment.find(eq =>
                eq.name?.toLowerCase() === equipmentName.toLowerCase()
            );

            if (existing) {
                // Add location if provided and not already present
                if (location) {
                    await this.addLocationToEquipment(existing.id, location);
                }
                // Update usage if exercise name provided
                if (exerciseName) {
                    await this.updateEquipmentUsage(existing.id, exerciseName);
                }
                return existing;
            }

            // Create new equipment
            const newEquipment = {
                name: equipmentName,
                locations: location ? [location] : [],
                location: null, // Use locations array instead
                exerciseTypes: exerciseName ? [exerciseName] : [],
                video: videoUrl || null
            };

            const equipmentId = await this.saveEquipment(newEquipment);
            return { id: equipmentId, ...newEquipment };

        } catch (error) {
            console.error('❌ Error getting or creating equipment:', error);
            return null;
        }
    }

    /**
     * Add a location to an equipment's locations array
     * Equipment can exist at multiple gyms
     */
    async addLocationToEquipment(equipmentId, locationName) {
        if (!this.appState.currentUser || !equipmentId || !locationName) {
            return;
        }

        try {
            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "equipment", equipmentId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                // Migrate from single location to locations array if needed
                let locations = data.locations || [];
                if (data.location && !locations.includes(data.location)) {
                    locations.push(data.location);
                }
                // Add new location if not already present
                if (!locations.includes(locationName)) {
                    locations.push(locationName);
                }

                await setDoc(docRef, {
                    ...data,
                    locations: locations,
                    location: null, // Clear old single location field
                    lastUsed: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error('❌ Error adding location to equipment:', error);
        }
    }

    // ===== LOCATION MANAGEMENT =====

    /**
     * Save a gym location
     */
    async saveLocation(locationData) {
        if (!this.appState.currentUser) {
            throw new Error('Must be signed in to save location');
        }

        try {
            const locationId = locationData.id ||
                `location_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "locations", locationId);

            const locationToSave = {
                id: locationId,
                name: locationData.name,
                latitude: locationData.latitude || null,
                longitude: locationData.longitude || null,
                radius: locationData.radius || 150, // Default 150 meters
                createdAt: locationData.createdAt || new Date().toISOString(),
                lastVisit: new Date().toISOString(),
                visitCount: (locationData.visitCount || 0) + 1
            };

            await setDoc(docRef, locationToSave);
            return { id: locationId, ...locationToSave };

        } catch (error) {
            console.error('❌ Error saving location:', error);
            throw error;
        }
    }

    /**
     * Get all user's saved gym locations
     */
    async getUserLocations() {
        if (!this.appState.currentUser) {
            return [];
        }

        try {
            const locationsRef = collection(this.db, "users", this.appState.currentUser.uid, "locations");
            const q = query(locationsRef, orderBy("lastVisit", "desc"));
            const querySnapshot = await getDocs(q);

            const locations = [];
            querySnapshot.forEach((doc) => {
                locations.push({ id: doc.id, ...doc.data() });
            });

            return locations;

        } catch (error) {
            console.error('❌ Error loading user locations:', error);
            return [];
        }
    }

    /**
     * Update location's last visit timestamp and increment visit count
     */
    async updateLocationVisit(locationId) {
        if (!this.appState.currentUser || !locationId) {
            return;
        }

        try {
            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "locations", locationId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                await setDoc(docRef, {
                    ...data,
                    lastVisit: new Date().toISOString(),
                    visitCount: (data.visitCount || 0) + 1
                });
            }

        } catch (error) {
            console.error('❌ Error updating location visit:', error);
        }
    }

    /**
     * Delete a gym location
     */
    async deleteLocation(locationId) {
        if (!this.appState.currentUser) {
            throw new Error('Must be signed in to delete location');
        }

        try {
            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "locations", locationId);
            await deleteDoc(docRef);
            return true;

        } catch (error) {
            console.error('❌ Error deleting location:', error);
            throw error;
        }
    }

    /**
     * Update a gym location
     */
    async updateLocation(locationId, updates) {
        if (!this.appState.currentUser) {
            throw new Error('Must be signed in to update location');
        }

        try {
            const docRef = doc(this.db, "users", this.appState.currentUser.uid, "locations", locationId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                await setDoc(docRef, {
                    ...data,
                    ...updates,
                    updatedAt: new Date().toISOString()
                });
                return true;
            }
            return false;

        } catch (error) {
            console.error('Error updating location:', error);
            throw error;
        }
    }

    /**
     * Find location by name
     */
    async getLocationByName(name) {
        if (!this.appState.currentUser || !name) {
            return null;
        }

        try {
            const locations = await this.getUserLocations();
            return locations.find(loc => loc.name === name) || null;

        } catch (error) {
            console.error('❌ Error finding location by name:', error);
            return null;
        }
    }

    /**
     * Get or create a location by name and coordinates
     */
    async getOrCreateLocation(name, coords = null) {
        if (!this.appState.currentUser || !name) {
            return null;
        }

        try {
            // Check if location already exists
            const existing = await this.getLocationByName(name);

            if (existing) {
                // Update visit count
                await this.updateLocationVisit(existing.id);
                return existing;
            }

            // Create new location
            const newLocation = {
                name: name,
                latitude: coords?.latitude || null,
                longitude: coords?.longitude || null,
                visitCount: 0
            };

            return await this.saveLocation(newLocation);

        } catch (error) {
            console.error('❌ Error getting or creating location:', error);
            return null;
        }
    }
}

// For backward compatibility
export { FirebaseWorkoutManager as WorkoutManager };