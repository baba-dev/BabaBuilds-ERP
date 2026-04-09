import path from "path";

const BACKUP_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "backups");
const BACKUP_DIR_RESOLVED = path.resolve(BACKUP_DIR);
const SAFE_FILENAME_CHARS_REGEX = /^[A-Za-z0-9T:._-]+$/;
const BACKUP_FILENAME_REGEX = /^ERP_BACKUP_[0-9T:.-]+\.zip$/;

export function validateAndResolveBackupPath(filename: string) {
  if (
    !filename ||
    filename.includes("\0") ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("..") ||
    !SAFE_FILENAME_CHARS_REGEX.test(filename) ||
    !BACKUP_FILENAME_REGEX.test(filename)
  ) {
    return { error: "Invalid filename format", status: 400 as const };
  }

  const resolvedPath = path.resolve(BACKUP_DIR, filename);
  const inBackupDir =
    resolvedPath === BACKUP_DIR_RESOLVED ||
    resolvedPath.startsWith(`${BACKUP_DIR_RESOLVED}${path.sep}`);

  if (!inBackupDir) {
    return { error: "Invalid filename format", status: 400 as const };
  }

  return { filePath: resolvedPath };
}
