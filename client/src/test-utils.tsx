import React, { type ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from './components/ui/tooltip'
import { SidebarPinProvider } from './context/SidebarPinContext'

// Default wrapper with MemoryRouter + TooltipProvider + SidebarPinProvider
function AllProviders({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <SidebarPinProvider>
        <TooltipProvider>
          {children}
        </TooltipProvider>
      </SidebarPinProvider>
    </MemoryRouter>
  )
}

function customRender(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { route?: string },
) {
  const { route, ...renderOptions } = options ?? {}
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={route ? [route] : ['/']}>
      <SidebarPinProvider>
        <TooltipProvider>
          {children}
        </TooltipProvider>
      </SidebarPinProvider>
    </MemoryRouter>
  )
  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

export * from '@testing-library/react'
export { customRender as render }
export { AllProviders }
