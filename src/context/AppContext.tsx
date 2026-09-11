'use client'

import { Clinica, User } from '@/types'
import React, { createContext, useContext, useState } from 'react'
interface AppContextType {
  user: User
  setUser: (user: User) => void
  activeClinic: Clinica 
  setActiveClinic: (clinic: Clinica ) => void
}

const defaultUser: User = {
  name: 'Dr. Juan Armando Guerra Guevara',
  roles: [{ roleId: 1, name: 'Medico' }, { roleId: 2, name: 'Enfermera' }],
  specialty: 'Medicina General',
  email: 'juan.guerra@docrecord.sv',
  password: '',
  enabled: true,
  userType: { userTypeID: 1, name: 'Medico' }
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User>(defaultUser)
  const [activeClinic, setActiveClinic] = useState<Clinica>({
    clinicaId: 1,
    name: 'Clínica Regional de Santa Ana',
    latitud: 13.9942,
    longitud: -89.5597,
    userId: 1
  })

  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        activeClinic,
        setActiveClinic,
      }}
    >
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

/**
 * Igual que `useAppContext`, pero para pantallas que solo se renderizan dentro
 * del portal, donde `PortalLayout` ya garantizó que hay sesión. Evita repetir
 * comprobaciones de `null` en cada componente.
 */
export const useUsuarioAutenticado = (): User => {
  const { user } = useAppContext()
  if (!user) {
    throw new Error('useUsuarioAutenticado requiere una sesión activa')
  }
  return user
}
