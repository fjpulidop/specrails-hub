import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { TicketDetailModal } from '../components/TicketDetailModal'
import { useTickets } from '../hooks/useTickets'

interface TicketDetailModalContextValue {
  openTicketDetail: (ticketId: number) => void
  closeTicketDetail: () => void
}

const TicketDetailModalContext = createContext<TicketDetailModalContextValue | null>(null)

export function TicketDetailModalProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<number | null>(null)
  const { tickets, updateTicket, deleteTicket } = useTickets()

  const openTicketDetail = useCallback((id: number) => setOpenId(id), [])
  const closeTicketDetail = useCallback(() => setOpenId(null), [])

  const allLabels = useMemo(() => {
    const set = new Set<string>()
    for (const t of tickets) for (const l of t.labels ?? []) set.add(l)
    return Array.from(set).sort()
  }, [tickets])

  const ticket = openId != null ? tickets.find((t) => t.id === openId) ?? null : null

  const value = useMemo(
    () => ({ openTicketDetail, closeTicketDetail }),
    [openTicketDetail, closeTicketDetail],
  )

  return (
    <TicketDetailModalContext.Provider value={value}>
      {children}
      {ticket && (
        <TicketDetailModal
          ticket={ticket}
          allLabels={allLabels}
          onClose={closeTicketDetail}
          onSave={updateTicket}
          onDelete={(id) => {
            deleteTicket(id)
            closeTicketDetail()
          }}
        />
      )}
    </TicketDetailModalContext.Provider>
  )
}

export function useTicketDetailModal(): TicketDetailModalContextValue {
  const ctx = useContext(TicketDetailModalContext)
  if (!ctx) {
    // No-op fallback so consumers can be safely placed outside the provider
    // (e.g. in unit tests). Logging helps surface accidental misuse.
    return {
      openTicketDetail: () => {
        if (typeof console !== 'undefined') {
          console.warn('[TicketDetailModalContext] openTicketDetail called without provider')
        }
      },
      closeTicketDetail: () => {},
    }
  }
  return ctx
}
