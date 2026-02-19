import { useState, useCallback, useRef, useEffect } from 'react';
import {
  FolderIcon,
  FolderOpenIcon,
  DocumentTextIcon,
  DocumentPlusIcon,
  FolderPlusIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ExclamationCircleIcon,
  XMarkIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { classNames } from '../utils';
import type { FileTreeNode } from '../types';
import type { UploadingFile } from '../hooks/useWorkspace';

// Key used to identify internal drag-and-drop vs OS file drops
const DRAG_KEY = 'application/x-cordbot-path';

interface FileTreeProps {
  files: FileTreeNode[];
  folderContents: Record<string, FileTreeNode[]>;
  loading: boolean;
  selectedPath: string | null;
  onFileClick: (path: string) => void;
  onFolderExpand: (path: string) => Promise<FileTreeNode[]>;
  onFileDrop: (file: File, folder: string) => void;
  onFileDelete: (path: string) => void;
  onFolderDelete: (path: string) => void;
  onCreateFile: (folderPath: string, name: string) => Promise<void>;
  onCreateFolder: (folderPath: string, name: string) => Promise<void>;
  onMoveItem: (sourcePath: string, destinationFolder: string) => void;
  uploadingFiles: UploadingFile[];
  dismissUploadError: (id: string) => void;
  refreshSignal: number;
}

export function FileTree({
  files,
  folderContents,
  loading,
  selectedPath,
  onFileClick,
  onFolderExpand,
  onFileDrop,
  onFileDelete,
  onFolderDelete,
  onCreateFile,
  onCreateFolder,
  onMoveItem,
  uploadingFiles,
  dismissUploadError,
  refreshSignal,
}: FileTreeProps) {
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [rootAdding, setRootAdding] = useState<'idle' | 'file' | 'folder'>('idle');

  const handleItemDragStart = useCallback((path: string | null) => {
    setDraggingPath(path);
    if (path === null) setDragOverFolder(null);
  }, []);

  const rootUploadingFiles = uploadingFiles.filter((f) => f.folder === '');

  return (
    <div>
      {/* Root "Workspace" header — always visible, always expanded */}
      <div
        className={classNames(
          dragOverFolder === ''
            ? 'bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-400 dark:bg-indigo-900/30 dark:text-white dark:ring-indigo-500'
            : 'text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white',
          'group flex items-center rounded-md text-sm font-semibold leading-6 mb-1'
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverFolder('');
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverFolder(null);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          const internalPath = e.dataTransfer.getData(DRAG_KEY);
          if (internalPath) {
            const currentParent = internalPath.includes('/')
              ? internalPath.substring(0, internalPath.lastIndexOf('/'))
              : '';
            if (currentParent !== '') {
              onMoveItem(internalPath, '');
            }
          } else {
            const file = e.dataTransfer.files[0];
            if (file) onFileDrop(file, '');
          }
          setDragOverFolder(null);
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-x-2 p-2">
          <FolderOpenIcon
            aria-hidden="true"
            className="size-5 shrink-0 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-white"
          />
          <span className="truncate flex-1 text-left">Workspace</span>
        </div>
        <button
          onClick={() => setRootAdding('file')}
          className="shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-600 dark:text-gray-600 dark:hover:text-indigo-400"
          title="Add file"
        >
          <DocumentPlusIcon className="size-4" />
        </button>
        <button
          onClick={() => setRootAdding('folder')}
          className="mr-1 shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-600 dark:text-gray-600 dark:hover:text-indigo-400"
          title="Add folder"
        >
          <FolderPlusIcon className="size-4" />
        </button>
      </div>

      <ul role="list" className="flex flex-1 flex-col gap-y-1">
        {rootAdding !== 'idle' && (
          <AddInputRow
            folderPath=""
            level={0}
            mode={rootAdding}
            onCreateFile={onCreateFile}
            onCreateFolder={onCreateFolder}
            onCancel={() => setRootAdding('idle')}
          />
        )}

        {loading && files.length === 0 ? (
          <li className="flex justify-center py-6">
            <div className="size-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent dark:border-indigo-400" />
          </li>
        ) : files.length === 0 && uploadingFiles.length === 0 && rootAdding === 'idle' ? (
          <li className="py-2 px-2 text-sm text-gray-400 dark:text-gray-600">No files found</li>
        ) : null}

        {files.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            selectedPath={selectedPath}
            onFileClick={onFileClick}
            onFolderExpand={onFolderExpand}
            level={0}
            dragOverFolder={dragOverFolder}
            setDragOverFolder={setDragOverFolder}
            onFileDrop={onFileDrop}
            onFileDelete={onFileDelete}
            onFolderDelete={onFolderDelete}
            onCreateFile={onCreateFile}
            onCreateFolder={onCreateFolder}
            onMoveItem={onMoveItem}
            draggingPath={draggingPath}
            onItemDragStart={handleItemDragStart}
            uploadingFiles={uploadingFiles}
            folderContents={folderContents}
            refreshSignal={refreshSignal}
          />
        ))}

        {/* Upload placeholders for root folder */}
        {rootUploadingFiles.map((f) => (
          <UploadPlaceholder key={f.id} file={f} onDismiss={dismissUploadError} />
        ))}
      </ul>
    </div>
  );
}

interface FileTreeItemProps {
  node: FileTreeNode;
  selectedPath: string | null;
  onFileClick: (path: string) => void;
  onFolderExpand: (path: string) => Promise<FileTreeNode[]>;
  level: number;
  dragOverFolder: string | null;
  setDragOverFolder: (folder: string | null) => void;
  onFileDrop: (file: File, folder: string) => void;
  onFileDelete: (path: string) => void;
  onFolderDelete: (path: string) => void;
  onCreateFile: (folderPath: string, name: string) => Promise<void>;
  onCreateFolder: (folderPath: string, name: string) => Promise<void>;
  onMoveItem: (sourcePath: string, destinationFolder: string) => void;
  draggingPath: string | null;
  onItemDragStart: (path: string | null) => void;
  uploadingFiles: UploadingFile[];
  folderContents: Record<string, FileTreeNode[]>;
  refreshSignal: number;
}

function FileTreeItem({
  node,
  selectedPath,
  onFileClick,
  onFolderExpand,
  level,
  dragOverFolder,
  setDragOverFolder,
  onFileDrop,
  onFileDelete,
  onFolderDelete,
  onCreateFile,
  onCreateFolder,
  onMoveItem,
  draggingPath,
  onItemDragStart,
  uploadingFiles,
  folderContents,
  refreshSignal,
}: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [addingMode, setAddingMode] = useState<'idle' | 'file' | 'folder'>('idle');

  // Children come from the shared folderContents map (not local state)
  const children = folderContents[node.path] ?? [];
  const hasBeenFetched = folderContents[node.path] !== undefined;

  const isSelected = selectedPath === node.path;
  const isDirectory = node.type === 'directory';
  const isDragTarget = dragOverFolder === node.path;

  const isInvalidDropTarget =
    draggingPath !== null &&
    (draggingPath === node.path || node.path.startsWith(draggingPath + '/'));

  const folderUploadingFiles = uploadingFiles.filter((f) => f.folder === node.path);

  // Re-fetch children when the tree structure changes externally (SSE / other operations)
  const isExpandedRef = useRef(false);
  isExpandedRef.current = isExpanded;
  useEffect(() => {
    if (isExpandedRef.current && node.type === 'directory') {
      onFolderExpand(node.path).catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const handleFolderDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const internalPath = e.dataTransfer.getData(DRAG_KEY);
    if (internalPath && !isInvalidDropTarget) {
      const currentParent = internalPath.includes('/')
        ? internalPath.substring(0, internalPath.lastIndexOf('/'))
        : '';
      if (currentParent !== node.path) {
        onMoveItem(internalPath, node.path);
      }
    } else if (!internalPath) {
      const file = e.dataTransfer.files[0];
      if (file) onFileDrop(file, node.path);
    }
    setDragOverFolder(null);
  }, [isInvalidDropTarget, node.path, onMoveItem, onFileDrop, setDragOverFolder]);

  const handleFolderDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isInvalidDropTarget) {
      setDragOverFolder(node.path);
      e.dataTransfer.dropEffect = 'move';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  }, [isInvalidDropTarget, node.path, setDragOverFolder]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const message = isDirectory
      ? `Delete folder "${node.name}" and all its contents?`
      : `Delete "${node.name}"?`;
    if (window.confirm(message)) {
      if (isDirectory) {
        onFolderDelete(node.path);
      } else {
        onFileDelete(node.path);
      }
    }
  }, [isDirectory, node.name, node.path, onFileDelete, onFolderDelete]);

  const handleExpand = useCallback(async () => {
    if (!isExpanded) {
      if (!hasBeenFetched && !isLoading) {
        setIsLoading(true);
        try {
          await onFolderExpand(node.path);
          setIsExpanded(true);
        } catch (error) {
          console.error('Error loading folder contents:', error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsExpanded(true);
      }
    }
  }, [isExpanded, hasBeenFetched, isLoading, node.path, onFolderExpand]);

  const handleClick = useCallback(async () => {
    if (isDirectory) {
      if (!isExpanded) {
        await handleExpand();
      } else {
        setIsExpanded(false);
      }
    } else {
      onFileClick(node.path);
    }
  }, [isDirectory, isExpanded, handleExpand, onFileClick, node.path]);

  const handleAddFile = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isExpanded) await handleExpand();
    setAddingMode('file');
  }, [isExpanded, handleExpand]);

  const handleAddFolder = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isExpanded) await handleExpand();
    setAddingMode('folder');
  }, [isExpanded, handleExpand]);

  const Icon = isDirectory ? FolderIcon : DocumentTextIcon;
  const ChevronIcon = isExpanded ? ChevronDownIcon : ChevronRightIcon;

  const sharedChildProps = {
    selectedPath,
    onFileClick,
    onFolderExpand,
    dragOverFolder,
    setDragOverFolder,
    onFileDrop,
    onFileDelete,
    onFolderDelete,
    onCreateFile,
    onCreateFolder,
    onMoveItem,
    draggingPath,
    onItemDragStart,
    uploadingFiles,
    folderContents,
    refreshSignal,
  };

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData(DRAG_KEY, node.path);
        e.dataTransfer.effectAllowed = 'move';
        onItemDragStart(node.path);
      }}
      onDragEnd={() => onItemDragStart(null)}
    >
      <div
        className={classNames(
          isSelected
            ? 'bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-white'
            : isDragTarget
            ? 'bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-400 dark:bg-indigo-900/30 dark:text-white dark:ring-indigo-500'
            : 'text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white',
          'group flex items-center rounded-md text-sm font-semibold leading-6'
        )}
      >
        <button
          onClick={handleClick}
          onDragOver={isDirectory ? handleFolderDragOver : undefined}
          onDrop={isDirectory ? handleFolderDrop : undefined}
          className="flex min-w-0 flex-1 items-center gap-x-2 p-2"
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          {isDirectory ? (
            <ChevronIcon
              aria-hidden="true"
              className={classNames(
                'size-4 shrink-0 text-gray-400 transition-transform',
                isLoading && 'animate-pulse'
              )}
            />
          ) : null}
          <Icon
            aria-hidden="true"
            className={classNames(
              isSelected
                ? 'text-indigo-600 dark:text-white'
                : isDragTarget
                ? 'text-indigo-500 dark:text-indigo-400'
                : 'text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-white',
              'size-5 shrink-0'
            )}
          />
          <span className="truncate flex-1 text-left" title={node.name}>
            {node.name}
          </span>
        </button>
        {isDirectory && (
          <>
            <button
              onClick={handleAddFile}
              className="shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-600 dark:text-gray-600 dark:hover:text-indigo-400"
              title="Add file"
            >
              <DocumentPlusIcon className="size-4" />
            </button>
            <button
              onClick={handleAddFolder}
              className="shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-600 dark:text-gray-600 dark:hover:text-indigo-400"
              title="Add folder"
            >
              <FolderPlusIcon className="size-4" />
            </button>
          </>
        )}
        <button
          onClick={handleDelete}
          className="mr-1 shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400"
          title={`Delete ${node.name}`}
        >
          <TrashIcon className="size-4" />
        </button>
      </div>

      {isDirectory && isExpanded && (
        // The children <ul> is also a drop target for this folder, so dropping
        // anywhere inside an expanded folder (e.g. onto a file) works correctly.
        <ul
          role="list"
          className="mt-1 space-y-1"
          onDragOver={handleFolderDragOver}
          onDrop={handleFolderDrop}
        >
          {addingMode !== 'idle' && (
            <AddInputRow
              folderPath={node.path}
              level={level + 1}
              mode={addingMode}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onCancel={() => setAddingMode('idle')}
            />
          )}
          {children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              level={level + 1}
              {...sharedChildProps}
            />
          ))}
          {folderUploadingFiles.map((f) => (
            <UploadPlaceholder key={f.id} file={f} onDismiss={() => {}} level={level + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

interface AddInputRowProps {
  folderPath: string;
  level: number;
  mode: 'file' | 'folder';
  onCreateFile: (folderPath: string, name: string) => Promise<void>;
  onCreateFolder: (folderPath: string, name: string) => Promise<void>;
  onCancel: () => void;
}

function AddInputRow({ folderPath, level, mode, onCreateFile, onCreateFolder, onCancel }: AddInputRowProps) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onCancel();
      return;
    }
    if (e.key === 'Enter') {
      const name = value.trim();
      if (!name) return;
      setLoading(true);
      setError(null);
      try {
        if (mode === 'folder') {
          await onCreateFolder(folderPath, name);
        } else {
          await onCreateFile(folderPath, name);
        }
        onCancel();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create');
      } finally {
        setLoading(false);
      }
    }
  }, [value, mode, folderPath, onCreateFile, onCreateFolder, onCancel]);

  const paddingLeft = `${level * 12 + 8}px`;

  return (
    <li>
      <div className="flex items-center rounded-md text-sm font-semibold leading-6 text-gray-700 dark:text-gray-400">
        <div className="flex min-w-0 flex-1 items-center gap-x-2 p-2" style={{ paddingLeft }}>
          {mode === 'folder'
            ? <FolderIcon className="size-5 shrink-0 text-gray-400" />
            : <DocumentTextIcon className="size-5 shrink-0 text-gray-400" />
          }
          {loading ? (
            <div className="flex flex-1 items-center gap-x-1.5">
              <div className="size-5 shrink-0 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent dark:border-indigo-400" />
              <span className="truncate text-gray-400 dark:text-gray-500">
                {value.trim()}{mode === 'file' ? '.md' : ''}
              </span>
            </div>
          ) : (
            <div className="flex flex-1 items-center gap-x-1">
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => { setValue(e.target.value); setError(null); }}
                onKeyDown={handleKeyDown}
                onBlur={onCancel}
                placeholder={mode === 'folder' ? 'Folder name' : 'File name'}
                className={classNames(
                  'min-w-0 flex-1 h-6 rounded border bg-white px-1.5 py-0 text-sm text-gray-900 outline-none dark:bg-gray-800 dark:text-white',
                  error
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-gray-300 focus:border-indigo-400 dark:border-gray-600 dark:focus:border-indigo-500'
                )}
                title={error ?? undefined}
              />
              {mode === 'file' && (
                <span className="shrink-0 text-gray-400 dark:text-gray-500">.md</span>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

interface UploadPlaceholderProps {
  file: UploadingFile;
  onDismiss: (id: string) => void;
  level?: number;
}

function UploadPlaceholder({ file, onDismiss, level = 0 }: UploadPlaceholderProps) {
  const folderLabel = file.folder ? ` → ${file.folder}/` : '';

  return (
    <li>
      <div
        className="flex w-full items-center gap-x-2 rounded-md p-2 text-sm leading-6"
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {file.status === 'uploading' ? (
          <div className="size-5 shrink-0 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent dark:border-indigo-400" />
        ) : (
          <ExclamationCircleIcon className="size-5 shrink-0 text-red-500 dark:text-red-400" />
        )}
        <span
          className={classNames(
            'truncate flex-1 text-left',
            file.status === 'uploading'
              ? 'text-gray-400 dark:text-gray-500'
              : 'text-red-500 dark:text-red-400'
          )}
          title={file.status === 'error' ? file.error : undefined}
        >
          {file.status === 'uploading'
            ? `Uploading ${file.originalFilename}${folderLabel}...`
            : `${file.originalFilename}${folderLabel}: ${file.error ?? 'Upload failed'}`}
        </span>
        {file.status === 'error' && (
          <button
            onClick={() => onDismiss(file.id)}
            className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            title="Dismiss"
          >
            <XMarkIcon className="size-4" />
          </button>
        )}
      </div>
    </li>
  );
}
