import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface UserProfile {
  name: string;
  photoBlob: Blob | null;
  photoPreview: string | null;
  passions: string;
}

interface AppState {
  // User profile data
  userProfile: UserProfile;
  profileComplete: boolean;
  
  // Match generation data
  screenshot: Blob | null;
  jobId: string | null;
  status: 'idle' | 'pending' | 'done' | 'error';
  imageUrl: string | null;
  
  // User profile actions
  setUserProfile: (profile: UserProfile) => void;
  setProfileComplete: (complete: boolean) => void;
  
  // Match generation actions
  setScreenshot: (b: Blob) => void;
  setJobId: (id: string) => void;
  setStatus: (status: 'idle' | 'pending' | 'done' | 'error') => void;
  setImageUrl: (url: string) => void;
  
  // Reset actions
  reset: () => void; // Resets everything including user profile
  resetMatch: () => void; // Only resets match-related data, keeps user profile
}

export const useStore = create<AppState>()(persist(
  (set) => ({
    // Initial user profile state
    userProfile: {
      name: "",
      photoBlob: null,
      photoPreview: null,
      passions: ""
    },
    profileComplete: false,
    
    // Initial match generation state
    screenshot: null,
    jobId: null,
    status: 'idle',
    imageUrl: null,
    
    // User profile actions
    setUserProfile: (profile: UserProfile) => set({ userProfile: profile }),
    setProfileComplete: (complete: boolean) => set({ profileComplete: complete }),
    
    // Match generation actions
    setScreenshot: (b: Blob) => set({ screenshot: b }),
    setJobId: (id: string) => set({ jobId: id }),
    setStatus: (status: 'idle' | 'pending' | 'done' | 'error') => set({ status }),
    setImageUrl: (url: string) => set({ imageUrl: url }),
    
    // Reset actions
    reset: () => set({ 
      userProfile: {
        name: "",
        photoBlob: null,
        photoPreview: null,
        passions: ""
      },
      profileComplete: false,
      screenshot: null, 
      jobId: null, 
      status: 'idle', 
      imageUrl: null 
    }),
    resetMatch: () => set({ 
      screenshot: null, 
      jobId: null, 
      status: 'idle', 
      imageUrl: null 
    }),
  }),
  {
    name: "serenade-app-session",
    storage: createJSONStorage(() => {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined') {
        return sessionStorage
      }
      // Return a dummy storage for SSR
      return {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }
    }),
    // Skip hydration to avoid SSR mismatch
    skipHydration: true,
    // Partial persist - exclude Blob objects from persistence
    partialize: (state) => ({
      userProfile: {
        name: state.userProfile.name,
        photoBlob: null, // Don't persist Blob objects
        photoPreview: state.userProfile.photoPreview,
        passions: state.userProfile.passions
      },
      profileComplete: state.profileComplete,
      screenshot: null, // Don't persist Blob objects
      jobId: state.jobId,
      status: state.status,
      imageUrl: state.imageUrl
    })
  }
));
