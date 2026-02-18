import { useState, useCallback } from 'react';
import {
  FolderIcon,
  DocumentTextIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ExclamationCircleIcon,
  XMarkIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { classNames } from '../utils';
import type { FileTreeNode } from '../types';
import type { UploadingFile } from '../hooks/useWorkspace';

interface FileTreeProps {
  files: FileTreeNode[];
  selectedPath: string | null;
  onFileClick: (path: string) => void;
  onFolderExpand: (path: string) => Promise<FileTreeNode[]>;
  onFileDrop: (file: File, folder: string) => void;
  onFileDelete: (path: string) => void;
  uploadingFiles: UploadingFile[];
  dismissUploadError: (id: string) => void;
}

export function FileTree({
  files,
  selectedPath,
  onFileClick,
  onFolderExpand,
  onFileDrop,
  onFileDelete,
  uploadingFiles,
  dismissUploadError,
}: FileTreeProps) {
  // null = not dragging, '' = over root, 'path' = over specific folder
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const rootUploadingFiles = uploadingFiles.filter((f) => f.folder === '');

  if (files.length === 0 && uploadingFiles.length === 0) {
    return (
      <div
        className={classNames(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-8 transition-colors',
          dragOverFolder !== null
            ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-900/20'
            : 'border-gray-200 dark:border-gray-700'
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverFolder('');
        }}
        onDragLeave={() => setDragOverFolder(null)}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) onFileDrop(file, '');
          setDragOverFolder(null);
        }}
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {dragOverFolder !== null ? 'Drop to upload' : 'No files found'}
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Drag & drop files here</p>
      </div>
    );
  }

  return (
    <ul
      role="list"
      className={classNames(
        'flex flex-1 flex-col gap-y-1 rounded-lg border-2 transition-colors',
        dragOverFolder === ''
          ? 'border-indigo-400 dark:border-indigo-500'
          : 'border-transparent'
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
        const file = e.dataTransfer.files[0];
        if (file) onFileDrop(file, dragOverFolder ?? '');
        setDragOverFolder(null);
      }}
    >
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
          uploadingFiles={uploadingFiles}
        />
      ))}

      {/* Upload placeholders for root folder */}
      {rootUploadingFiles.map((f) => (
        <UploadPlaceholder key={f.id} file={f} onDismiss={dismissUploadError} />
      ))}

      {/* Drop hint when dragging over root */}
      {dragOverFolder === '' && (
        <li className="pointer-events-none">
          <div className="flex items-center gap-x-2 rounded-md border border-dashed border-indigo-400 p-2 text-xs text-indigo-500 dark:border-indigo-500 dark:text-indigo-400">
            Drop here → root folder
          </div>
        </li>
      )}
    </ul>
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
  uploadingFiles: UploadingFile[];
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
  uploadingFiles,
}: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<FileTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const isSelected = selectedPath === node.path;
  const isDirectory = node.type === 'directory';
  const isDragTarget = dragOverFolder === node.path;

  const folderUploadingFiles = uploadingFiles.filter((f) => f.folder === node.path);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${node.name}"?`)) {
      onFileDelete(node.path);
    }
  }, [node.name, node.path, onFileDelete]);

  const handleClick = useCallback(async () => {
    if (isDirectory) {
      if (!isExpanded) {
        if (children.length === 0 && !isLoading) {
          setIsLoading(true);
          try {
            const fetchedChildren = await onFolderExpand(node.path);
            setChildren(fetchedChildren);
            setIsExpanded(true);
          } catch (error) {
            console.error('Error loading folder contents:', error);
          } finally {
            setIsLoading(false);
          }
        } else {
          setIsExpanded(true);
        }
      } else {
        setIsExpanded(false);
      }
    } else {
      onFileClick(node.path);
    }
  }, [isDirectory, isExpanded, children.length, isLoading, node.path, onFolderExpand, onFileClick]);

  const Icon = isDirectory ? FolderIcon : DocumentTextIcon;
  const ChevronIcon = isExpanded ? ChevronDownIcon : ChevronRightIcon;

  return (
    <li>
      <div className="group flex items-center">
        <button
          onClick={handleClick}
          onDragOver={
            isDirectory
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverFolder(node.path);
                }
              : undefined
          }
          onDrop={
            isDirectory
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files[0];
                  if (file) onFileDrop(file, node.path);
                  setDragOverFolder(null);
                }
              : undefined
          }
          className={classNames(
            isSelected
              ? 'bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-white'
              : isDragTarget
              ? 'bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-400 dark:bg-indigo-900/30 dark:text-white dark:ring-indigo-500'
              : 'text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white',
            'flex min-w-0 flex-1 items-center gap-x-2 rounded-md p-2 text-sm font-semibold leading-6'
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          {isDirectory && (
            <ChevronIcon
              aria-hidden="true"
              className={classNames(
                'size-4 shrink-0 text-gray-400 transition-transform',
                isLoading && 'animate-pulse'
              )}
            />
          )}
          {!isDirectory && <span className="w-4" />}
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
          {isDragTarget && (
            <span className="shrink-0 text-xs text-indigo-500 dark:text-indigo-400">Drop here</span>
          )}
        </button>
        {!isDirectory && (
          <button
            onClick={handleDelete}
            className="mr-1 hidden shrink-0 rounded p-1 text-gray-400 hover:text-red-500 group-hover:block dark:text-gray-600 dark:hover:text-red-400"
            title={`Delete ${node.name}`}
          >
            <TrashIcon className="size-4" />
          </button>
        )}
      </div>

      {isDirectory && isExpanded && (children.length > 0 || folderUploadingFiles.length > 0) && (
        <ul role="list" className="mt-1 space-y-1">
          {children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onFileClick={onFileClick}
              onFolderExpand={onFolderExpand}
              level={level + 1}
              dragOverFolder={dragOverFolder}
              setDragOverFolder={setDragOverFolder}
              onFileDrop={onFileDrop}
              onFileDelete={onFileDelete}
              uploadingFiles={uploadingFiles}
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
        <span className="w-4" />
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
