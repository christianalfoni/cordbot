import { useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ListBulletIcon, ClipboardIcon, ArrowDownTrayIcon, CheckIcon } from '@heroicons/react/24/outline';

interface FileViewerProps {
  content: string;
  path: string | null;
  apiBase: string;
}

interface Heading {
  level: number;
  text: string;
  id: string;
}

// Helper to generate slug from heading text
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// Helper to extract headings from markdown
function extractHeadings(content: string): Heading[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: Heading[] = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2];
    const id = slugify(text);
    headings.push({ level, text, id });
  }

  return headings;
}

export function FileViewer({ content, path, apiBase }: FileViewerProps) {
  const isMarkdown = path?.endsWith('.md') || path?.endsWith('.markdown');
  const articleRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState<'docx' | 'pdf' | null>(null);

  const headings = useMemo(() => {
    return isMarkdown ? extractHeadings(content) : [];
  }, [content, isMarkdown]);

  if (!path) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <svg
              className="h-6 w-6 text-gray-400 dark:text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">No file selected</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Select a file from the sidebar to view its contents
          </p>
        </div>
      </div>
    );
  }

  const handleTocClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCopy = async () => {
    if (!articleRef.current) return;
    const html = articleRef.current.innerHTML;
    const plainText = articleRef.current.innerText;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: copy plain text
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async (format: 'docx' | 'pdf') => {
    if (!path || downloading) return;
    setDownloading(format);
    try {
      const res = await fetch(
        `${apiBase}/convert/${format}?file=${encodeURIComponent(path)}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Failed to convert to ${format}` }));
        console.error('Download error:', err.error);
        return;
      }
      const blob = await res.blob();
      const baseName = path.split('/').pop()?.replace(/\.(md|markdown)$/i, '') ?? 'document';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="h-full bg-gray-50 dark:bg-black/10 flex flex-col px-4 py-6 sm:px-6 lg:px-8">
      <div className="relative mx-auto w-full max-w-7xl flex flex-col flex-1 min-h-0 rounded-xl bg-white shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10 overflow-hidden">
        {/* Canvas toolbar */}
        {isMarkdown && (
          <div className="flex shrink-0 items-center justify-end gap-x-3 px-8 py-3 border-b border-gray-200 dark:border-white/10">
            {/* Copy button */}
            <button
              onClick={handleCopy}
              title="Copy as rich text"
              className="flex items-center gap-x-1 text-sm/6 font-medium text-gray-900 dark:text-white"
            >
              {copied ? (
                <CheckIcon className="size-5 text-green-500" />
              ) : (
                <ClipboardIcon className="size-5 text-gray-500" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>

            {/* Download dropdown */}
            <Menu as="div" className="relative">
              <MenuButton
                disabled={downloading !== null}
                className="flex items-center gap-x-1 text-sm/6 font-medium text-gray-900 dark:text-white disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="size-5 text-gray-500" />
                {downloading ? 'Downloading…' : 'Download'}
              </MenuButton>
              <MenuItems
                transition
                className="absolute right-0 z-10 mt-2.5 w-40 origin-top-right rounded-md bg-white py-2 shadow-lg ring-1 ring-gray-900/5 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in dark:bg-gray-800 dark:ring-white/10"
              >
                <MenuItem>
                  <button
                    onClick={() => handleDownload('docx')}
                    className="block w-full text-left px-3 py-1.5 text-sm/6 text-gray-900 data-[focus]:bg-gray-50 data-[focus]:outline-hidden dark:text-white dark:data-[focus]:bg-white/5"
                  >
                    Word (.docx)
                  </button>
                </MenuItem>
                <MenuItem>
                  <button
                    onClick={() => handleDownload('pdf')}
                    className="block w-full text-left px-3 py-1.5 text-sm/6 text-gray-900 data-[focus]:bg-gray-50 data-[focus]:outline-hidden dark:text-white dark:data-[focus]:bg-white/5"
                  >
                    PDF (.pdf)
                  </button>
                </MenuItem>
              </MenuItems>
            </Menu>

            {/* Table of contents */}
            {headings.length > 0 && (
              <Menu as="div" className="relative">
                <MenuButton className="flex items-center gap-x-1 text-sm/6 font-medium text-gray-900 dark:text-white">
                  <ListBulletIcon aria-hidden="true" className="size-5 text-gray-500" />
                  Contents
                </MenuButton>
                <MenuItems
                  transition
                  className="absolute right-0 z-10 mt-2.5 w-64 max-h-96 origin-top-right overflow-y-auto rounded-md bg-white py-2 shadow-lg ring-1 ring-gray-900/5 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in dark:bg-gray-800 dark:ring-white/10"
                >
                  {headings.map((heading, index) => (
                    <MenuItem key={`${heading.id}-${index}`}>
                      <button
                        onClick={() => handleTocClick(heading.id)}
                        className="block w-full text-left px-3 py-1 text-sm/6 text-gray-900 data-[focus]:bg-gray-50 data-[focus]:outline-hidden dark:text-white dark:data-[focus]:bg-white/5"
                        style={{ paddingLeft: `${(heading.level - 1) * 12 + 12}px` }}
                      >
                        {heading.text}
                      </button>
                    </MenuItem>
                  ))}
                </MenuItems>
              </Menu>
            )}
          </div>
        )}

        {/* Scrollable content area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-8 sm:p-12">
          {isMarkdown ? (
            <article ref={articleRef} className="prose prose-gray max-w-none dark:prose-invert">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children, ...props }) => (
                    <h1 id={slugify(String(children))} {...props}>
                      {children}
                    </h1>
                  ),
                  h2: ({ children, ...props }) => (
                    <h2 id={slugify(String(children))} {...props}>
                      {children}
                    </h2>
                  ),
                  h3: ({ children, ...props }) => (
                    <h3 id={slugify(String(children))} {...props}>
                      {children}
                    </h3>
                  ),
                  h4: ({ children, ...props }) => (
                    <h4 id={slugify(String(children))} {...props}>
                      {children}
                    </h4>
                  ),
                  h5: ({ children, ...props }) => (
                    <h5 id={slugify(String(children))} {...props}>
                      {children}
                    </h5>
                  ),
                  h6: ({ children, ...props }) => (
                    <h6 id={slugify(String(children))} {...props}>
                      {children}
                    </h6>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </article>
          ) : (
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
              <pre className="overflow-x-auto text-sm text-gray-900 dark:text-gray-100">
                <code>{content}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
