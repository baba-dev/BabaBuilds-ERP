/**
 * Appends a cache-busting query parameter to a URL.
 * This is essential for Cloudflare/CDN environments where files
 * like PDFs or Logos are updated in-place on the disk.
 * 
 * @param url The asset URL to bust (e.g. /invoices/abc.pdf)
 * @param version A string or Date to use for the version. If null, uses current timestamp.
 * @returns The versioned URL (e.g. /invoices/abc.pdf?v=123456789)
 */
export function getBustedUrl(url: string | null | undefined, version?: string | number | Date | null): string {
  if (!url) return "";
  
  // Use provided version, or fallback to current timestamp (one-minute resolution to avoid over-fetching)
  const v = version 
    ? (version instanceof Date ? version.getTime() : version)
    : Math.floor(Date.now() / 60000); 

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${v}`;
}
