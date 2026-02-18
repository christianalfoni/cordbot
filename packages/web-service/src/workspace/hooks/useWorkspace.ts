import { useState, useEffect, useCallback } from 'react';
import type { FileTreeNode, WorkspaceFileChange } from '../types';

export interface UploadingFile {
  id: string;
  originalFilename: string;
  folder: string;
  status: 'uploading' | 'error';
  error?: string;
}

export function useWorkspace(apiBase: string) {
  const [files, setFiles] = useState<FileTreeNode[]>([]);
  const [content, setContent] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);

  // Fetch files in directory
  const fetchFiles = useCallback(async (path: string = '') => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${apiBase}/files?path=${encodeURIComponent(path)}`);

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
  }, [apiBase]);

  // Fetch folder contents (for expansion)
  const fetchFolderContents = useCallback(async (path: string): Promise<FileTreeNode[]> => {
    try {
      const res = await fetch(`${apiBase}/files?path=${encodeURIComponent(path)}`);

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
  }, [apiBase]);

  // Fetch file content
  const fetchFile = useCallback(async (path: string) => {
    try {
      setLoading(true);
      setError(null);
      // Encode each path segment to handle spaces, parens, and other special chars
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(`${apiBase}/file/${encodedPath}`);

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
  }, [apiBase]);

  // Upload a file to the workspace
  const uploadFile = useCallback(async (file: File, folder: string = '') => {
    const id = `${Date.now()}-${file.name}`;
    const placeholder: UploadingFile = {
      id,
      originalFilename: file.name,
      folder,
      status: 'uploading',
    };

    setUploadingFiles((prev) => [...prev, placeholder]);

    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix (e.g., "data:application/pdf;base64,")
          const base64Data = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch(`${apiBase}/upload`, {
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
        // Remove placeholder and explicitly refresh the file tree
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
  }, [apiBase, fetchFiles]);

  // Dismiss an upload error
  const dismissUploadError = useCallback((id: string) => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Delete a file from the workspace
  const deleteFile = useCallback(async (filePath: string) => {
    try {
      const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(`${apiBase}/file/${encodedPath}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Delete failed');
      }

      // Clear selected file if it was the one deleted
      if (filePath === selectedPath) {
        setSelectedPath(null);
        setContent('');
      }

      await fetchFiles();
    } catch (err) {
      console.error('Error deleting file:', err);
    }
  }, [apiBase, selectedPath, fetchFiles]);

  // Setup SSE connection for real-time updates
  useEffect(() => {
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(`${apiBase}/events`);

      eventSource.onmessage = (event) => {
        const change: WorkspaceFileChange = JSON.parse(event.data);

        if (change.type === 'change' && change.path === selectedPath) {
          // Reload current file if it changed
          console.log('🔄 File changed, reloading:', change.path);
          fetchFile(selectedPath);
        } else if (['add', 'unlink', 'addDir', 'unlinkDir'].includes(change.type)) {
          // Refresh file tree on structural changes
          console.log('🌳 File tree changed:', change.type, change.path);
          fetchFiles();
        }
      };

      eventSource.onerror = () => {
        console.error('❌ SSE connection error');
      };
    } catch (err) {
      console.error('Failed to setup SSE:', err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [apiBase, selectedPath, fetchFile, fetchFiles]);

  // Keep-alive: Fetch files periodically to extend token
  useEffect(() => {
    const interval = setInterval(() => {
      fetchFiles();
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [fetchFiles]);

  // Initial load
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

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
