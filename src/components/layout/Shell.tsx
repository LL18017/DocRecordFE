'use client'

import React, { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

interface ShellProps {
  title?: string
  children: React.ReactNode
}

export const Shell: React.FC<ShellProps> = ({ title, children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen flex bg-doc-surface">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col lg:ml-60 min-w-0">
        <TopBar
          title={title}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  )
}
