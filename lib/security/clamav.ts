import NodeClam from 'clamscan';
import { Readable } from 'stream';

let clamScanPromise: Promise<unknown> | null = null;

function getClamScan() {
  if (clamScanPromise) return clamScanPromise as Promise<any>;

  const isLinux = process.platform === 'linux';
  const isProd = process.env.NODE_ENV === 'production';
  
  // During build or on non-linux, we might want to skip heavy init
  if (!isLinux && !isProd) {
    console.warn('⚠️ [ClamAV] Non-Linux environment detected, scanner will likely fail-open in dev.');
  }

  clamScanPromise = new NodeClam().init({
      removeInfected: false,
      quarantineInfected: false,
      scanLog: undefined,
      debugMode: false,
      fileList: undefined,
      scanRecursively: true,
      clamscan: {
          path: '/usr/bin/clamscan',
          db: undefined,
          scanArchives: true,
          active: true
      },
      clamdscan: {
          socket: '/var/run/clamav/clamd.ctl',
          host: false,
          port: false,
          timeout: 60000,
          localFallback: true,
          path: '/usr/bin/clamdscan',
          configFile: undefined,
          multiscan: true,
          reloadDb: false,
          active: isLinux, // only active if linux
          bypassTest: false,
      },
      preference: 'clamdscan'
  });

  return clamScanPromise;
}

export async function scanBuffer(buffer: Buffer): Promise<boolean> {
  try {
    const clamscan = await getClamScan();
    const stream = Readable.from(buffer);
    const { isInfected, viruses } = await clamscan.scanStream(stream);

    if (isInfected) {
      console.warn('⚠️ [ClamAV] Malware detected:', viruses);
      return false; // Not safe
    }
    return true; // Safe
  } catch (error) {
    console.error('⚠️ [ClamAV Error]:', error);
    
    // Fail closed whenever production runtime is detected, even if ERP_SECURITY_MODE is unset.
    const isProduction = process.env.NODE_ENV === 'production' || process.env.ERP_SECURITY_MODE === 'PRODUCTION';
    
    if (isProduction) {
      console.error('🛑 [ClamAV] Scanner unavailable in PRODUCTION. Rejecting file for security.');
      return false; // Fail-closed in production
    }

    // Fallback for development/other modes
    return true;
  }
}
