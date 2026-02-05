'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface ConfirmationOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  isDangerous?: boolean
}

interface ConfirmationContextType {
  confirm: (options: ConfirmationOptions) => Promise<boolean>
}

const ConfirmationContext = createContext<ConfirmationContextType | null>(null)

export function ConfirmationProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmationOptions | null>(null)
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmationOptions): Promise<boolean> => {
    setOptions(opts)
    setIsOpen(true)

    return new Promise<boolean>((resolve) => {
      setResolvePromise(() => resolve)
    })
  }, [])

  const handleConfirm = useCallback(() => {
    setIsOpen(false)
    if (resolvePromise) {
      resolvePromise(true)
      setResolvePromise(null)
    }
  }, [resolvePromise])

  const handleCancel = useCallback(() => {
    setIsOpen(false)
    if (resolvePromise) {
      resolvePromise(false)
      setResolvePromise(null)
    }
  }, [resolvePromise])

  return (
    <ConfirmationContext.Provider value={{ confirm }}>
      {children}

      <Dialog open={isOpen} onClose={handleCancel} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="mx-auto max-w-md rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl">
            <div className="flex items-start">
              <div className="shrink-0">
                <ExclamationTriangleIcon
                  className={`h-6 w-6 ${options?.isDangerous ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}
                  aria-hidden="true"
                />
              </div>
              <div className="ml-3 flex-1">
                <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                  {options?.title || 'Confirm Action'}
                </DialogTitle>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {options?.message}
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600"
              >
                {options?.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className={`rounded-md px-3 py-2 text-sm font-semibold text-white shadow-xs ${
                  options?.isDangerous
                    ? 'bg-red-600 hover:bg-red-500 dark:bg-red-500 dark:hover:bg-red-400'
                    : 'bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400'
                }`}
              >
                {options?.confirmText || 'Confirm'}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </ConfirmationContext.Provider>
  )
}

export function useConfirmation() {
  const context = useContext(ConfirmationContext)
  if (!context) {
    throw new Error('useConfirmation must be used within ConfirmationProvider')
  }
  return context
}
