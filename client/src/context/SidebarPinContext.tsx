import { createContext, useContext, useState } from 'react'
import type { ReactNode, Dispatch, SetStateAction } from 'react'

interface SidebarPinContextValue {
  leftPinned: boolean
  setLeftPinned: Dispatch<SetStateAction<boolean>>
  rightPinned: boolean
  setRightPinned: Dispatch<SetStateAction<boolean>>
}

const SidebarPinContext = createContext<SidebarPinContextValue>({
  leftPinned: false,
  setLeftPinned: () => {},
  rightPinned: false,
  setRightPinned: () => {},
})

export function SidebarPinProvider({ children }: { children: ReactNode }) {
  const [leftPinned, setLeftPinned] = useState(false)
  const [rightPinned, setRightPinned] = useState(false)

  return (
    <SidebarPinContext.Provider value={{ leftPinned, setLeftPinned, rightPinned, setRightPinned }}>
      {children}
    </SidebarPinContext.Provider>
  )
}

export function useSidebarPin() {
  return useContext(SidebarPinContext)
}
