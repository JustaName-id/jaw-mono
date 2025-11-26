import React from 'react'

interface CalloutProps {
  type?: 'warning' | 'info' | 'error'
  children: React.ReactNode
}

export function Callout({ type = 'warning', children }: CalloutProps) {
  return (
    <div className={`callout-${type}`}>
      {children}
    </div>
  )
}