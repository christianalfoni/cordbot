import { useState } from 'react';
import { useParams } from 'react-router-dom';
import cordSmall from '../cord_small.png';
import { Dialog, DialogBackdrop, DialogPanel, TransitionChild } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useWorkspace } from '../workspace/hooks/useWorkspace';
import { FileTree } from '../workspace/components/FileTree';
import { FileViewer } from '../workspace/components/FileViewer';

export function Workspace() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { guildId, token } = useParams<{ guildId: string; token: string }>();
  const apiBase = `/api/workspace/${guildId}/${token}`;

  const {
    files,
    content,
    selectedPath,
    error,
    uploadingFiles,
    fetchFile,
    fetchFolderContents,
    uploadFile,
    dismissUploadError,
    deleteFile,
  } = useWorkspace(apiBase);

  if (!token || !guildId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">❌ Invalid Link</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">No workspace token provided in URL</p>
        </div>
      </div>
    );
  }

  if (error && !files.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">❌ Error</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Mobile sidebar */}
      <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 lg:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-gray-900/80 transition-opacity duration-300 ease-linear data-[closed]:opacity-0"
        />
        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-[closed]:-translate-x-full"
          >
            <TransitionChild>
              <div className="absolute left-full top-0 flex w-16 justify-center pt-5 duration-300 ease-in-out data-[closed]:opacity-0">
                <button type="button" onClick={() => setSidebarOpen(false)} className="-m-2.5 p-2.5">
                  <span className="sr-only">Close sidebar</span>
                  <XMarkIcon aria-hidden="true" className="size-6 text-white" />
                </button>
              </div>
            </TransitionChild>
            <div className="relative flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-2 dark:bg-gray-900 dark:ring dark:ring-white/10 dark:before:pointer-events-none dark:before:absolute dark:before:inset-0 dark:before:bg-black/10">
              <div className="flex h-16 shrink-0 items-center gap-x-3">
                <img src={cordSmall} alt="Cordbot" className="h-8 w-8 rounded-full" />
                <span className="text-lg font-semibold text-gray-900 dark:text-white">Cordbot Workspace</span>
              </div>
              <nav className="flex flex-1 flex-col">
                <FileTree
                  files={files}
                  selectedPath={selectedPath}
                  onFileClick={(path) => { fetchFile(path); setSidebarOpen(false); }}
                  onFolderExpand={fetchFolderContents}
                  onFileDrop={uploadFile}
                  onFileDelete={deleteFile}
                  uploadingFiles={uploadingFiles}
                  dismissUploadError={dismissUploadError}
                />
              </nav>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* Static sidebar for desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-96 lg:flex-col dark:bg-gray-900">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 dark:border-white/10 dark:bg-black/10">
          <div className="flex h-16 shrink-0 items-center gap-x-3">
            <img src={cordSmall} alt="Cordbot" className="h-8 w-8 rounded-full" />
            <span className="text-lg font-semibold text-gray-900 dark:text-white">Cordbot Workspace</span>
          </div>
          <nav className="flex flex-1 flex-col">
            <FileTree
              files={files}
              selectedPath={selectedPath}
              onFileClick={fetchFile}
              onFolderExpand={fetchFolderContents}
              onFileDrop={uploadFile}
              onFileDelete={deleteFile}
              uploadingFiles={uploadingFiles}
              dismissUploadError={dismissUploadError}
            />
          </nav>
        </div>
      </div>

      {/* Main content */}
      <main className="h-screen overflow-hidden bg-white dark:bg-gray-900 lg:pl-96">
        <FileViewer content={content} path={selectedPath} apiBase={apiBase} />
      </main>
    </div>
  );
}
