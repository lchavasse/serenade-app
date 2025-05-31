import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface AppState {
  screenshot: Blob | null;
  jobId: string | null;
  status: 'idle' | 'pending' | 'done' | 'error';
  imageUrl: string | null;
  setScreenshot: (b: Blob) => void;
  setJobId: (id: string) => void;
  setStatus: (status: 'idle' | 'pending' | 'done' | 'error') => void;
  setImageUrl: (url: string) => void;
  reset: () => void;
}

export const useStore = create<AppState>()(persist(
  (set) => ({
    screenshot: null,
    jobId: null,
    status: 'idle',
    imageUrl: null,
    setScreenshot: (b: Blob) => set({ screenshot: b }),
    setJobId: (id: string) => set({ jobId: id }),
    setStatus: (status: 'idle' | 'pending' | 'done' | 'error') => set({ status }),
    setImageUrl: (url: string) => set({ imageUrl: url }),
    reset: () => set({ 
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
  }
));
