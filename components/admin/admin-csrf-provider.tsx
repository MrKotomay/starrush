"use client"

import { createContext, useContext } from "react"

const AdminCsrfContext = createContext<string | null>(null)

export function AdminCsrfProvider({
  children,
  token,
}: {
  children: React.ReactNode
  token: string | null
}) {
  return <AdminCsrfContext.Provider value={token}>{children}</AdminCsrfContext.Provider>
}

export function useAdminCsrfToken() {
  const value = useContext(AdminCsrfContext)
  if (!value) {
    throw new Error("Admin CSRF token is missing")
  }
  return value
}
