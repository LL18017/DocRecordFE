'use client'

import React, { createContext, useContext, useState } from 'react'
import { User, Clinica } from '@/types'
import { clinicas } from '@/data/mockData'

interface AppContextType {
  user: User
  setUser: (user: User) => void
  activeClinic: Clinica | null
  setActiveClinic: (clinic: Clinica | null) => void
}

const defaultUser: User = {
  name: 'Dr. Juan Armando Guerra Guevara',
  role: 'medico',
  specialty: 'Medicina General',
  email: 'juan.guerra@docrecord.sv',
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User>(defaultUser)
  const [activeClinic, setActiveClinic] = useState<Clinica | null>(clinicas[0])

  return (
    <AppContext.Provider value={{ user, setUser, activeClinic, setActiveClinic }}>
      {children}
    </AppContext.Provider>
  )
}

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider')
  }
  return context
}
