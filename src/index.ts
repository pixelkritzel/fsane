import path from 'path';
import fsLegacy, { BaseEncodingOptions, Mode, OpenMode, PathLike } from 'fs';

const fs = fsLegacy.promises;

const DIRECTORY = 'DIRECTORY' as const;
const EMPTY_DIRECTORY = 'EMPTY_DIRECTORY' as const;
const FILE = 'FILE' as const;

function createReturnTypeDirectory(resolvedPath: string, files: string[]) {
  return {
    type: DIRECTORY,
    files: files.map((fileName) => () => fz(resolvedPath, '/', fileName)),
  };
}

function createReturnType(
  resolvedPath: string,
  returnTypeData: { type: typeof EMPTY_DIRECTORY } | { type: typeof DIRECTORY; files: string[] }
) {
  const baseReturnTypeDirectory = {
    path: resolvedPath,

    addPath: function (...fragments: string[]) {
      return fz(resolvedPath, ...fragments);
    },
    writeFile: createWriteFile(resolvedPath),
  };

  if (returnTypeData.type === DIRECTORY) {
    return {
      ...baseReturnTypeDirectory,
      ...createReturnTypeDirectory(resolvedPath, returnTypeData.files),
    };
  } else if (returnTypeData.type === EMPTY_DIRECTORY) {
    return {
      type: EMPTY_DIRECTORY,
      ...baseReturnTypeDirectory,
    };
  } else {
    throw new Error('tried to create unknown return type');
  }
}

function createWriteFile(resolvedPath: string) {
  async function writeFile(
    fileName: string,
    data: string | Uint8Array,
    options?: (BaseEncodingOptions & { mode?: Mode; flag?: OpenMode }) | BufferEncoding | null
  ) {
    await fs.writeFile(path.resolve(resolvedPath, fileName), data, options);
  }
}

function createMkDir(resolvedPath: string) {
  return async function mkDir() {
    await fs.mkdir(resolvedPath, { recursive: true });
    return createReturnType(resolvedPath, { type: EMPTY_DIRECTORY });
  };
}

function createReadFile(resolvedPath: string) {
  async function readFile(options?: { encoding?: null; flag?: OpenMode } | BufferEncoding) {
    return fs.readFile(resolvedPath, options);
  }
  return readFile;
}

type fzNotOnFS = {
  type: 'NOT_ON_FS';
  exists: false;
  mkDir: ReturnType<typeof createMkDir>;
};

type fzBaseDirectory = {
  path: string;
  addPath: typeof fz;
  writeFile: ReturnType<typeof createWriteFile>;
};

type fzEmptyDirectory = { type: typeof EMPTY_DIRECTORY } & fzBaseDirectory;
type fzDirectory = {
  type: typeof DIRECTORY;
  files: Array<() => Promise<fzReturn>>;
} & fzBaseDirectory;
type fzFile = {
  type: typeof FILE;
  path: string;
  read: ReturnType<typeof createReadFile>;
};

type fzReturn = fzNotOnFS | fzEmptyDirectory | fzDirectory | fzFile;

export async function fz(...fragments: string[]): Promise<fzReturn> {
  const resolvedPath = path.resolve(fragments.join(''));
  const isOnFileSystem = fsLegacy.existsSync(resolvedPath);

  if (!isOnFileSystem)
    return {
      type: 'NOT_ON_FS',
      exists: false,
      mkDir: createMkDir(resolvedPath),
      // writeFile: cre,
    };
  const stats = await fs.stat(resolvedPath);
  if (stats.isDirectory()) {
    const filesInDirectory = await fs.readdir(resolvedPath);
    if (filesInDirectory.length === 0) {
      return createReturnType(resolvedPath, { type: EMPTY_DIRECTORY });
    } else {
      return createReturnType(resolvedPath, {
        type: DIRECTORY,
        files: filesInDirectory,
      });
    }
  } else {
    return { type: FILE, path: resolvedPath, read: createReadFile(resolvedPath) };
  }
}

async function test() {
  console.log('Starting');
  const result = await fz(process.cwd());
  // console.log(result);
  if (result.type === 'FILE') {
    console.log(await result.read('utf-8'));
  }
  if (result.type === 'DIRECTORY') {
    console.log('DIRECTORY');
    result.files.forEach(async (file) => {
      const res = await file();
      if (res.type !== 'NOT_ON_FS') {
        console.log(res.path);
      }
      if (res.type === 'DIRECTORY') {
        console.log('FILES LENGTH:', res.files.length);
      }
    });
  }
}

test();
