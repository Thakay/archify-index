import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { commonFolder, inside, isRoot } from '../src/paths.mjs';

test('finds the folder that holds a set, on POSIX', () => {
  const p = path.posix;
  assert.equal(commonFolder(['/work/docs/a', '/work/docs/b/c'], p), '/work/docs');
  assert.equal(commonFolder(['/work/docs'], p), '/work/docs');
  assert.equal(commonFolder(['/a', '/b'], p), '/');
  assert.ok(isRoot('/', p));
  assert.ok(!inside('/work/docs', '/work/docs-old/a.html', p), 'a sibling with a longer name is not inside');
});

test('finds the folder that holds a set, on Windows', () => {
  const p = path.win32;
  assert.equal(commonFolder(['C:\\Docs\\set\\a', 'c:\\docs\\SET\\b'], p).toLowerCase(), 'c:\\docs\\set');
  assert.equal(commonFolder(['C:\\Docs\\a', 'C:\\Work\\b'], p), 'C:\\');
  assert.ok(isRoot(commonFolder(['C:\\Docs\\a', 'C:\\Work\\b'], p), p), 'the top of a drive is refused by the caller');
  assert.equal(commonFolder(['C:\\Docs', 'D:\\Docs'], p), null, 'two drives share no folder');
  assert.equal(commonFolder(['\\\\server\\share\\a\\x', '\\\\server\\share\\a\\y'], p), '\\\\server\\share\\a');
});
