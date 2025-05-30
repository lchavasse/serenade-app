import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface AppState {
  profile: Record<string, any>;
  screenshot: Blob | null;
  jobId: string | null;
  setProfile: (p: Record<string, any>) => void;
  setScreenshot: (b: Blob) => void;
  setJobId: (id: string) => void;
}

export const useStore = create<AppState>()(persist(
  (set) => ({
    profile: {},
    screenshot: null,
    jobId: null,
    setProfile: (p: Record<string, any>) => set({ profile: p }),
    setScreenshot: (b: Blob) => set({ screenshot: b }),
    setJobId: (id: string) => set({ jobId: id }),
  }),
  {
    name: "song-app-session",
    storage: createJSONStorage(() => sessionStorage),
  }
));
