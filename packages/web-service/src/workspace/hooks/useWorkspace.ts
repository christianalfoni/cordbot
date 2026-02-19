import { useState, useEffect, useCallback, useRef } from 'react';
import type { FileTreeNode, WorkspaceFileChange } from '../types';

export interface UploadingFile {
  id: string;
  originalFilename: string;
  folder: string;
  status: 'uploading' | 'error';
  error?: string;
}

function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });
}

export function useWorkspace(
  apiBase: string | null,
  authToken: string | null,
  onTokenExpired: () => Promise<string | null>
) {
  // Root-level files — also backed by a ref for synchronous reads in callbacks
  const [files, setFilesState] = useState<FileTreeNode[]>([]);
  const filesRef = useRef<FileTreeNode[]>([]);

  // Folder contents keyed by folder path — backed by a ref for synchronous reads
  const [folderContents, setFolderContentsState] = useState<Record<string, FileTreeNode[]>>({});
  const folderContentsRef = useRef<Record<string, FileTreeNode[]>>({});

  const [content, setContent] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  // Start as true so the sidebar shows a spinner before the first fetch completes
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [refreshSignal, setRefreshSignal] = useState(0);

  // Keep authToken in a ref so callbacks don't need to re-create on token changes
  const authTokenRef = useRef<string | null>(authToken);
  useEffect(() => {
    authTokenRef.current = authToken;
  }, [authToken]);

  // Helpers that update both the ref (synchronously) and React state
  const setFiles = (nodes: FileTreeNode[]) => {
    filesRef.current = nodes;
    setFilesState(nodes);
  };
  const setFolderContents = (contents: Record<string, FileTreeNode[]>) => {
    folderContentsRef.current = contents;
    setFolderContentsState(contents);
  };

  // Authenticated fetch with automatic 401 retry
  const authedFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const token = authTokenRef.current;
    const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      const newToken = await onTokenExpired();
      if (newToken) {
        authTokenRef.current = newToken;
        const retryHeaders = { ...headers, 'Authorization': `Bearer ${newToken}` };
        return fetch(url, { ...options, headers: retryHeaders });
      }
    }

    return res;
  }, [onTokenExpired]);

  // Fetch files in root directory
  const fetchFiles = useCallback(async (path: string = '') => {
    if (!apiBase) return;
    try {
      setLoading(true);
      setError(null);
      const res = await authedFetch(`${apiBase}/files?path=${encodeURIComponent(path)}`);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch files');
      }

      const data = await res.json();
      setFiles(data.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch files');
      console.error('Error fetching files:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authedFetch]);

  // Fetch folder contents and store in folderContents state
  const fetchFolderContents = useCallback(async (path: string): Promise<FileTreeNode[]> => {
    if (!apiBase) return [];
    try {
      const res = await authedFetch(`${apiBase}/files?path=${encodeURIComponent(path)}`);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch folder contents');
      }

      const data = await res.json();
      const next = { ...folderContentsRef.current, [path]: data.files };
      folderContentsRef.current = next;
      setFolderContentsState(next);
      return data.files;
    } catch (err) {
      console.error('Error fetching folder contents:', err);
      throw err;
    }
  }, [apiBase, authedFetch]);

  // Fetch file content
  const fetchFile = useCallback(async (path: string) => {
    if (!apiBase) return;
    try {
      setLoading(true);
      setError(null);
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const res = await authedFetch(`${apiBase}/file/${encodedPath}`);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch file');
      }

      const data = await res.json();
      setContent(data.content);
      setSelectedPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch file');
      console.error('Error fetching file:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authedFetch]);

  // Upload a file to the workspace
  const uploadFile = useCallback(async (file: File, folder: string = '') => {
    if (!apiBase) return;
    const id = `${Date.now()}-${file.name}`;
    const placeholder: UploadingFile = { id, originalFilename: file.name, folder, status: 'uploading' };
    setUploadingFiles((prev) => [...prev, placeholder]);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await authedFetch(`${apiBase}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type, data: base64, folder }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setUploadingFiles((prev) =>
          prev.map((f) => f.id === id ? { ...f, status: 'error', error: errData.error || 'Upload failed' } : f)
        );
      } else {
        setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
        await fetchFiles();
        setRefreshSignal(s => s + 1);
      }
    } catch (err) {
      setUploadingFiles((prev) =>
        prev.map((f) => f.id === id ? { ...f, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' } : f)
      );
    }
  }, [apiBase, authedFetch, fetchFiles]);

  // Dismiss an upload error
  const dismissUploadError = useCallback((id: string) => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Delete a file — removes from tree immediately (optimistic)
  const deleteFile = useCallback(async (filePath: string) => {
    if (!apiBase) return;

    const parentFolder = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';

    if (parentFolder === '') {
      setFiles(filesRef.current.filter(f => f.path !== filePath));
    } else {
      setFolderContents({
        ...folderContentsRef.current,
        [parentFolder]: (folderContentsRef.current[parentFolder] ?? []).filter(f => f.path !== filePath),
      });
    }

    if (filePath === selectedPath) {
      setSelectedPath(null);
      setContent('');
    }

    try {
      const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
      const res = await authedFetch(`${apiBase}/file/${encodedPath}`, { method: 'DELETE' });

      if (!res.ok) {
        const errData = await res.json();
        await fetchFiles();
        setRefreshSignal(s => s + 1);
        throw new Error(errData.error || 'Delete failed');
      }
    } catch (err) {
      console.error('Error deleting file:', err);
    }
  }, [apiBase, authedFetch, selectedPath, fetchFiles]);

  // Create a new markdown file — adds to tree immediately (optimistic)
  const createFile = useCallback(async (folderPath: string, name: string) => {
    if (!apiBase) return;
    const filename = name.endsWith('.md') ? name : `${name}.md`;
    const relativePath = folderPath ? `${folderPath}/${filename}` : filename;

    const newNode: FileTreeNode = { name: filename, path: relativePath, type: 'file' };
    if (folderPath === '') {
      setFiles(sortNodes([...filesRef.current, newNode]));
    } else {
      setFolderContents({
        ...folderContentsRef.current,
        [folderPath]: sortNodes([...(folderContentsRef.current[folderPath] ?? []), newNode]),
      });
    }

    const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
    const res = await authedFetch(`${apiBase}/file/${encodedPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '' }),
    });

    if (!res.ok) {
      // Revert
      if (folderPath === '') {
        setFiles(filesRef.current.filter(f => f.path !== relativePath));
      } else {
        setFolderContents({
          ...folderContentsRef.current,
          [folderPath]: (folderContentsRef.current[folderPath] ?? []).filter(f => f.path !== relativePath),
        });
      }
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to create file');
    }
  }, [apiBase, authedFetch]);

  // Create a new folder — adds to tree immediately (optimistic)
  const createFolder = useCallback(async (folderPath: string, name: string) => {
    if (!apiBase) return;
    const relativePath = folderPath ? `${folderPath}/${name}` : name;

    const newNode: FileTreeNode = { name, path: relativePath, type: 'directory' };
    if (folderPath === '') {
      setFiles(sortNodes([...filesRef.current, newNode]));
    } else {
      setFolderContents({
        ...folderContentsRef.current,
        [folderPath]: sortNodes([...(folderContentsRef.current[folderPath] ?? []), newNode]),
      });
    }

    const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
    const res = await authedFetch(`${apiBase}/folder/${encodedPath}`, { method: 'POST' });

    if (!res.ok) {
      // Revert
      if (folderPath === '') {
        setFiles(filesRef.current.filter(f => f.path !== relativePath));
      } else {
        setFolderContents({
          ...folderContentsRef.current,
          [folderPath]: (folderContentsRef.current[folderPath] ?? []).filter(f => f.path !== relativePath),
        });
      }
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to create folder');
    }
  }, [apiBase, authedFetch]);

  // Move a file or folder — updates both source and destination immediately (optimistic)
  const moveItem = useCallback(async (sourcePath: string, destinationFolder: string) => {
    if (!apiBase) return;

    const name = sourcePath.split('/').pop()!;
    const newPath = destinationFolder ? `${destinationFolder}/${name}` : name;
    const sourceParent = sourcePath.includes('/') ? sourcePath.substring(0, sourcePath.lastIndexOf('/')) : '';

    // Find the node being moved so we can add it to the destination
    const sourceList = sourceParent === '' ? filesRef.current : (folderContentsRef.current[sourceParent] ?? []);
    const movedNode = sourceList.find(f => f.path === sourcePath);
    if (!movedNode) return;

    // Build the updated state in one pass
    let nextFiles = filesRef.current;
    let nextFolderContents = folderContentsRef.current;

    // Remove from source
    if (sourceParent === '') {
      nextFiles = nextFiles.filter(f => f.path !== sourcePath);
    } else {
      nextFolderContents = {
        ...nextFolderContents,
        [sourceParent]: (nextFolderContents[sourceParent] ?? []).filter(f => f.path !== sourcePath),
      };
    }

    // Add to destination (only if destination contents are already loaded)
    const updatedNode: FileTreeNode = { ...movedNode, path: newPath };
    if (destinationFolder === '') {
      nextFiles = sortNodes([...nextFiles, updatedNode]);
    } else if (nextFolderContents[destinationFolder] !== undefined) {
      nextFolderContents = {
        ...nextFolderContents,
        [destinationFolder]: sortNodes([...nextFolderContents[destinationFolder], updatedNode]),
      };
    }

    setFiles(nextFiles);
    setFolderContents(nextFolderContents);

    // Update selectedPath if the moved item or a file inside it was selected
    setSelectedPath((current) => {
      if (current === null) return null;
      if (current === sourcePath) return newPath;
      if (current.startsWith(sourcePath + '/')) return newPath + current.slice(sourcePath.length);
      return current;
    });

    const res = await authedFetch(`${apiBase}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath, destinationFolder }),
    });

    if (!res.ok) {
      const errData = await res.json();
      await fetchFiles();
      setRefreshSignal(s => s + 1);
      throw new Error(errData.error || 'Failed to move');
    }
  }, [apiBase, authedFetch, fetchFiles]);

  // Delete a folder — removes from tree immediately (optimistic), clears all loaded subfolders
  const deleteFolder = useCallback(async (folderPath: string) => {
    if (!apiBase) return;

    const parentFolder = folderPath.includes('/') ? folderPath.substring(0, folderPath.lastIndexOf('/')) : '';

    // Remove the folder from its parent's list and clear any loaded subfolder contents
    const nextFolderContents = Object.fromEntries(
      Object.entries(folderContentsRef.current)
        .filter(([key]) => key !== folderPath && !key.startsWith(folderPath + '/'))
        .map(([key, val]) => key === parentFolder ? [key, val.filter(f => f.path !== folderPath)] : [key, val])
    );
    folderContentsRef.current = nextFolderContents;
    setFolderContentsState(nextFolderContents);

    if (parentFolder === '') {
      setFiles(filesRef.current.filter(f => f.path !== folderPath));
    }

    if (selectedPath?.startsWith(folderPath + '/') || selectedPath === folderPath) {
      setSelectedPath(null);
      setContent('');
    }

    try {
      const encodedPath = folderPath.split('/').map(encodeURIComponent).join('/');
      const res = await authedFetch(`${apiBase}/folder/${encodedPath}`, { method: 'DELETE' });

      if (!res.ok) {
        const errData = await res.json();
        await fetchFiles();
        setRefreshSignal(s => s + 1);
        throw new Error(errData.error || 'Delete failed');
      }
    } catch (err) {
      console.error('Error deleting folder:', err);
    }
  }, [apiBase, authedFetch, selectedPath, fetchFiles]);

  // Setup SSE connection for real-time updates
  // EventSource doesn't support custom headers, so token is passed as query param
  useEffect(() => {
    if (!apiBase || !authToken) return;

    let eventSource: EventSource | null = null;
    let closed = false;

    const connect = (token: string) => {
      if (closed) return;
      eventSource = new EventSource(`${apiBase}/events?token=${encodeURIComponent(token)}`);

      eventSource.onmessage = (event) => {
        const change: WorkspaceFileChange = JSON.parse(event.data);

        if (change.type === 'change' && change.path === selectedPath) {
          fetchFile(selectedPath);
        } else if (['add', 'unlink', 'addDir', 'unlinkDir'].includes(change.type)) {
          fetchFiles();
          setRefreshSignal(s => s + 1);
        }
      };

      eventSource.onerror = async () => {
        if (closed) return;
        console.error('❌ SSE connection error - refreshing token');
        eventSource?.close();
        try {
          const newToken = await onTokenExpired();
          if (newToken) {
            authTokenRef.current = newToken;
            connect(newToken);
          }
        } catch {
          console.error('Failed to refresh token for SSE reconnect');
        }
      };
    };

    connect(authToken);

    return () => {
      closed = true;
      eventSource?.close();
    };
  }, [apiBase, authToken, onTokenExpired, selectedPath, fetchFile, fetchFiles]);

  // Initial load
  useEffect(() => {
    if (apiBase && authToken) {
      fetchFiles();
    } else {
      setLoading(false);
    }
  }, [apiBase, authToken, fetchFiles]);

  return {
    files,
    folderContents,
    content,
    selectedPath,
    loading,
    error,
    uploadingFiles,
    refreshSignal,
    fetchFiles,
    fetchFile,
    fetchFolderContents,
    uploadFile,
    dismissUploadError,
    createFile,
    createFolder,
    moveItem,
    deleteFile,
    deleteFolder,
  };
}
