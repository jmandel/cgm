import { FHIRBundle, FHIRDiagnosticReport, FHIRObservation } from './types';
import { v4 as uuidv4 } from 'uuid';
import renderToAttachment from '../render-pdf';

export async function generateDiagnosticReport(bundle: FHIRBundle): Promise<FHIRBundle> {
  const cgmSummaryObservations = bundle.entry.filter(
    (entry) =>
      entry.resource.resourceType === 'Observation' &&
      entry.resource.code.coding.some((coding) => coding.code === 'cgm-summary')
  ) as { fullUrl: string; resource: FHIRObservation }[];

  let newEntries: (FHIRDiagnosticReport & { fullUrl: string })[] = [];

  for (const cgmSummaryObs of cgmSummaryObservations) {
    const effectivePeriod = {
      start: cgmSummaryObs.resource.effectivePeriod!.start,
      end: cgmSummaryObs.resource.effectivePeriod!.end,
    };

    console.log('For', cgmSummaryObs);

    newEntries.push({
      resourceType: 'DiagnosticReport',
      id: uuidv4(),
      meta: {
        profile: ['http://argo.run/cgm/StructureDefinition/cgm-summary-pdf'],
      },
      status: 'final',
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
            system: 'http://argo.run/cgm/CodeSystem/cgm-summary-codes-temporary',
            code: 'cgm-summary',
          },
        ],
      },
      subject: {
        reference: 'Patient/patientExample',
      },
      effectivePeriod,
      issued: new Date().toISOString(),
      result: cgmSummaryObs.resource.hasMember!.map((member) => ({
        reference: member.reference,
      })),
      presentedForm: [
        await renderToAttachment({
          ...bundle,
          entry: [cgmSummaryObs, ...bundle.entry],
        }),
      ],
      fullUrl: `urn:uuid:${uuidv4()}`,
    });
  }

  return {
    ...bundle,
    entry: [
      ...newEntries,
      ...bundle.entry,
    ],
  };
}