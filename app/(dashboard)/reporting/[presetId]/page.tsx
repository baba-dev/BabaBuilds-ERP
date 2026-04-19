import { ReportingCenter } from '@/components/reporting/reporting-center';

export default async function ReportingPresetPage({ params }: { params: Promise<{ presetId: string }> }) {
  const { presetId } = await params;
  return <ReportingCenter initialPresetId={presetId} />;
}
