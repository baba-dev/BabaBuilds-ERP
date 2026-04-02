import NodeClam from 'clamscan';
import { Readable } from 'stream';

const ClamScan = new NodeClam().init({
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
        socket: false,
        host: false,
        port: false,
        timeout: 60000,
        localFallback: true,
        path: '/usr/bin/clamdscan',
        configFile: undefined,
        multiscan: true,
        reloadDb: false,
        active: true,
        bypassTest: false,
    },
    preference: 'clamdscan'
});

export async function scanBuffer(buffer: Buffer): Promise<boolean> {
  try {
    const clamscan = await ClamScan;
    const stream = Readable.from(buffer);
    const { isInfected, viruses } = await clamscan.scanStream(stream);

    if (isInfected) {
      console.warn('⚠️ [ClamAV] Malware detected:', viruses);
      return false; // Not safe
    }
    return true; // Safe
  } catch (error) {
    console.error('⚠️ [ClamAV Error]:', error);
    
    // Check security mode
    const isProduction = process.env.ERP_SECURITY_MODE === 'PRODUCTION';
    
    if (isProduction) {
      console.error('🛑 [ClamAV] Scanner unavailable in PRODUCTION. Rejecting file for security.');
      return false; // Fail-closed in production
    }

    // Fallback for development/other modes
    return true;
  }
}
