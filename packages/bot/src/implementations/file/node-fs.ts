import fs from 'fs';
import type { IFileStore } from '../../interfaces/file.js';

/**
 * Node.js file system implementation
 * Uses synchronous fs operations for simplicity
 */
export class NodeFileStore implements IFileStore {
  exists(path: string): boolean {
    return fs.existsSync(path);
  }

  readFile(path: string, encoding: BufferEncoding = 'utf-8'): string {
    return fs.readFileSync(path, encoding);
  }

  writeFile(path: string, content: string | Buffer, encoding: BufferEncoding = 'utf-8'): void {
    if (typeof content === 'string') {
      fs.writeFileSync(path, content, encoding);
    } else {
      fs.writeFileSync(path, content);
    }
  }

  appendFile(path: string, content: string, encoding: BufferEncoding = 'utf-8'): void {
    fs.appendFileSync(path, content, encoding);
  }

  deleteFile(path: string): void {
    fs.unlinkSync(path);
  }

  deleteDirectory(path: string): void {
    fs.rmSync(path, { recursive: true, force: true });
  }

  createDirectory(path: string): void {
    fs.mkdirSync(path, { recursive: true });
  }

  readDirectory(path: string): string[] {
    return fs.readdirSync(path);
  }

  getStats(path: string) {
    const stats = fs.statSync(path);
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtime,
    };
  }
}
