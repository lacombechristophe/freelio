import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface TimerState {
  isRunning: boolean
  elapsed: number
  projectId: string
  startTimer: (projectId: string) => void
  stopTimer: () => void
  resetTimer: () => void
  tick: () => void
  setProject: (projectId: string) => void
}

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      isRunning: false,
      elapsed: 0,
      projectId: "",
      startTimer: (projectId: string) => {
        if (!projectId) return
        set({ isRunning: true, projectId })
      },
      stopTimer: () => set({ isRunning: false }),
      resetTimer: () => set({ isRunning: false, elapsed: 0, projectId: "" }),
      tick: () => {
        if (get().isRunning) {
          set((state) => ({ elapsed: state.elapsed + 1 }))
        }
      },
      setProject: (projectId: string) => set({ projectId }),
    }),
    {
      name: "crm-timer-storage",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
)
