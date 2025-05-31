import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface UserProfile {
  name: string;
  photoBlob: Blob | null;
  photoPreview: string | null;
  passions: string;
}

// Job status types
type JobStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'error';

// Result types for each job
interface SongResult {
  audioUrl?: string;
  lyrics?: string;
  analysis?: string;
  style?: string;
  sunoTaskId?: string;
}

interface VideoResult {
  videoUrl?: string;
  imageUrl?: string;
  enhancedPrompt?: string;
  falRequestId?: string;
}

interface AppState {
  // User profile data
  userProfile: UserProfile;
  profileComplete: boolean;
  
  // Match generation data (keeping screenshot for legacy compatibility)
  screenshot: Blob | null;
  imageUrl: string | null;
  
  // Individual job tracking
  songJobId: string | null;
  songStatus: JobStatus;
  songResult: SongResult | null;
  
  videoJobId: string | null;
  videoStatus: JobStatus;
  videoResult: VideoResult | null;
  
  // User profile actions
  setUserProfile: (profile: UserProfile) => void;
  setProfileComplete: (complete: boolean) => void;
  
  // Match generation actions
  setScreenshot: (b: Blob) => void;
  setImageUrl: (url: string) => void;
  
  // Job management actions
  setSongJob: (id: string, status: JobStatus, result?: SongResult) => void;
  setVideoJob: (id: string, status: JobStatus, result?: VideoResult) => void;
  updateSongStatus: (status: JobStatus) => void;
  updateVideoStatus: (status: JobStatus) => void;
  updateSongResult: (result: SongResult) => void;
  updateVideoResult: (result: VideoResult) => void;
  
  // Reset actions
  reset: () => void; // Resets everything including user profile
  resetMatch: () => void; // Only resets match-related data, keeps user profile
  resetJobs: () => void; // Only resets job-related data
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
    imageUrl: null,
    
    // Initial job tracking state
    songJobId: null,
    songStatus: 'idle',
    songResult: null,
    videoJobId: null,
    videoStatus: 'idle',
    videoResult: null,
    
    // User profile actions
    setUserProfile: (profile: UserProfile) => set({ userProfile: profile }),
    setProfileComplete: (complete: boolean) => set({ profileComplete: complete }),
    
    // Match generation actions
    setScreenshot: (b: Blob) => set({ screenshot: b }),
    setImageUrl: (url: string) => set({ imageUrl: url }),
    
    // Job management actions
    setSongJob: (id: string, status: JobStatus, result?: SongResult) => set({ songJobId: id, songStatus: status, songResult: result }),
    setVideoJob: (id: string, status: JobStatus, result?: VideoResult) => set({ videoJobId: id, videoStatus: status, videoResult: result }),
    updateSongStatus: (status: JobStatus) => set({ songStatus: status }),
    updateVideoStatus: (status: JobStatus) => set({ videoStatus: status }),
    updateSongResult: (result: SongResult) => set({ songResult: result }),
    updateVideoResult: (result: VideoResult) => set({ videoResult: result }),
    
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
      imageUrl: null, 
      songJobId: null, 
      songStatus: 'idle', 
      songResult: null,
      videoJobId: null,
      videoStatus: 'idle',
      videoResult: null
    }),
    resetMatch: () => set({ 
      screenshot: null, 
      imageUrl: null, 
      songJobId: null, 
      songStatus: 'idle', 
      songResult: null,
      videoJobId: null,
      videoStatus: 'idle',
      videoResult: null
    }),
    resetJobs: () => set({ 
      songJobId: null, 
      songStatus: 'idle', 
      songResult: null,
      videoJobId: null,
      videoStatus: 'idle',
      videoResult: null
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
      imageUrl: state.imageUrl,
      songJobId: state.songJobId,
      songStatus: state.songStatus,
      songResult: state.songResult,
      videoJobId: state.videoJobId,
      videoStatus: state.videoStatus,
      videoResult: state.videoResult
    })
  }
));
