// Folder arithmetic for the index. Each function takes the platform's path module, so Windows
// behaviour (drive letters, case-insensitive names, UNC shares) is testable on any system.

import path from 'node:path';

/** Whether `file` is `folder` or below it; case-insensitive where the platform's paths are. */
export function inside(folder, file, p = path) {
  const relative = p.relative(folder, file);
  return !p.isAbsolute(relative) && relative.split(p.sep)[0] !== '..';
}

/** The deepest folder that holds every one of `folders`, or null when none does (two drives). */
export function commonFolder(folders, p = path) {
  let common = p.resolve(folders[0]);
  for (const folder of folders) {
    while (!inside(common, folder, p)) {
      const parent = p.dirname(common);
      if (parent === common) return null;
      common = parent;
    }
  }
  return common;
}

/** Whether `folder` is the top of its drive or file system. */
export const isRoot = (folder, p = path) => p.dirname(folder) === folder;
