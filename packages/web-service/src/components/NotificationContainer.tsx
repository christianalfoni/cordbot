'use client'

import { Transition } from '@headlessui/react'
import { XMarkIcon, CheckCircleIcon, XCircleIcon, InformationCircleIcon } from '@heroicons/react/20/solid'
import { useNotification, NotificationType } from '../context/NotificationContext'

const iconMap: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircleIcon,
  error: XCircleIcon,
  info: InformationCircleIcon,
}

const colorMap: Record<NotificationType, string> = {
  success: 'text-green-500',
  error: 'text-red-500',
  info: 'text-blue-500',
}

export function NotificationContainer() {
  const { notifications, removeNotification } = useNotification()

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6 z-50"
    >
      <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
        {notifications.map((notification) => {
          const Icon = iconMap[notification.type]
          const iconColor = colorMap[notification.type]

          return (
            <Transition
              key={notification.id}
              show={true}
              enter="transform transition duration-300 ease-out"
              enterFrom="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
              enterTo="translate-y-0 opacity-100 sm:translate-x-0"
              leave="transition duration-100 ease-in"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="pointer-events-auto w-full max-w-sm rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-gray-800 dark:ring-white dark:ring-opacity-10">
                <div className="p-4">
                  <div className="flex items-start">
                    <div className="shrink-0 pt-0.5">
                      <Icon className={`h-6 w-6 ${iconColor}`} aria-hidden="true" />
                    </div>
                    <div className="ml-3 w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {notification.message}
                      </p>
                    </div>
                    <div className="ml-4 flex shrink-0">
                      <button
                        type="button"
                        onClick={() => removeNotification(notification.id)}
                        className="inline-flex rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:hover:text-white dark:focus:ring-indigo-400"
                      >
                        <span className="sr-only">Close</span>
                        <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          )
        })}
      </div>
    </div>
  )
}
