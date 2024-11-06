import { FHIRBundle, FHIRDiagnosticReport, FHIRObservation, DEFAULT_PATIENT_DISPLAY } from '../agp-calc';
import { v4 as uuidv4 } from 'uuid';
import renderToAttachment from '../render-pdf';

export async function generateDiagnosticReport(bundle: FHIRBundle): Promise<FHIRBundle> {
  const cgmSummaryObservations = bundle.entry.filter(
    (entry) =>
      entry.resource.resourceType === 'Observation' &&
      entry.resource.code.coding.some((coding) => coding.code === 'cgm-summary')
  ) as { fullUrl: string; resource: FHIRObservation }[];

  let newEntries: FHIRBundle["entry"]  = [];

  for (const cgmSummaryObs of cgmSummaryObservations) {
    const effectivePeriod = {
      start: cgmSummaryObs.resource.effectivePeriod!.start,
      end: cgmSummaryObs.resource.effectivePeriod!.end,
    };

    console.log('For', cgmSummaryObs);
    const dr: FHIRDiagnosticReport = {
      resourceType: 'DiagnosticReport',
      id: uuidv4(),
      status: 'final',
      subject: {
        display: DEFAULT_PATIENT_DISPLAY
      },
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
              code: 'LAB',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: 'http://hl7.org/uv/cgm/CodeSystem/cgm-summary-codes-temporary',
            code: 'cgm-summary',
            display: "CGM Summary Report"
          },
        ],
      },
      effectivePeriod,
      issued: new Date().toISOString(),
      result: [{
        reference: cgmSummaryObs.fullUrl
      }],
      presentedForm: [
        await renderToAttachment({
          ...bundle,
          entry: [cgmSummaryObs, ...bundle.entry],
        }),
      ],
    }
    newEntries.push({
      fullUrl: `urn:uuid:${dr.id}`,
      resource: dr});
  }

  return {
    ...bundle,
    entry: [
      ...newEntries,
      ...bundle.entry,
    ],
  };
}