import { useState, useEffect, useCallback, useRef } from 'react';
import type { FileTreeNode, WorkspaceFileChange } from '../types';

export interface UploadingFile {
  id: string;
  originalFilename: string;
  folder: string;
  status: 'uploading' | 'error';
  error?: string;
}

export function useWorkspace(
  apiBase: string | null,
  authToken: string | null,
  onTokenExpired: () => Promise<string | null>
) {
  const [files, setFiles] = useState<FileTreeNode[]>([]);
  const [content, setContent] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);

  // Keep authToken in a ref so callbacks don't need to re-create on token changes
  const authTokenRef = useRef<string | null>(authToken);
  useEffect(() => {
    authTokenRef.current = authToken;
  }, [authToken]);

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

  // Fetch files in directory
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

  // Fetch folder contents (for expansion)
  const fetchFolderContents = useCallback(async (path: string): Promise<FileTreeNode[]> => {
    if (!apiBase) return [];
    try {
      const res = await authedFetch(`${apiBase}/files?path=${encodeURIComponent(path)}`);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch folder contents');
      }

      const data = await res.json();
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
    const placeholder: UploadingFile = {
      id,
      originalFilename: file.name,
      folder,
      status: 'uploading',
    };

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
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          data: base64,
          folder,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, status: 'error', error: errData.error || 'Upload failed' } : f
          )
        );
      } else {
        setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
        await fetchFiles();
      }
    } catch (err) {
      setUploadingFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' }
            : f
        )
      );
    }
  }, [apiBase, authedFetch, fetchFiles]);

  // Dismiss an upload error
  const dismissUploadError = useCallback((id: string) => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Delete a file from the workspace
  const deleteFile = useCallback(async (filePath: string) => {
    if (!apiBase) return;
    try {
      const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
      const res = await authedFetch(`${apiBase}/file/${encodedPath}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Delete failed');
      }

      if (filePath === selectedPath) {
        setSelectedPath(null);
        setContent('');
      }

      await fetchFiles();
    } catch (err) {
      console.error('Error deleting file:', err);
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
    }
  }, [apiBase, authToken, fetchFiles]);

  return {
    files,
    content,
    selectedPath,
    loading,
    error,
    uploadingFiles,
    fetchFiles,
    fetchFile,
    fetchFolderContents,
    uploadFile,
    dismissUploadError,
    deleteFile,
  };
}
