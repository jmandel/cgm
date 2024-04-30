import { FHIRBundle, FHIRDiagnosticReport, FHIRObservation } from "../agp-calc";
import { v4 as uuidv4 } from "uuid";
import renderToAttachment from "../render-pdf";

export async function generateDiagnosticReport(bundle: FHIRBundle): Promise<FHIRBundle> {
  const agpObservations = bundle.entry.filter(
    (entry) =>
      entry.resource.resourceType === "Observation" &&
      entry.resource.code.coding.some((coding) => coding.code === "ambulatory-glucose-profile")
  ) as { fullUrl: string; resource: FHIRObservation }[];

  const effectivePeriod = {
    start: agpObservations[0].resource.effectivePeriod!.start,
    end: agpObservations[agpObservations.length - 1].resource.effectivePeriod!.end,
  };

  const diagnosticReport: FHIRDiagnosticReport = {
    resourceType: "DiagnosticReport",
    id: uuidv4(),
    status: "final",
    code: {
      coding: [
        {
          system: "http://loinc.org",
          code: "60591-1",
          display: "Ambulatory glucose profile",
        },
      ],
    },
    effectivePeriod,
    result: agpObservations.slice(0, 1).map((obs) => ({
      reference: obs.fullUrl,
    })),
    presentedForm: [await renderToAttachment(bundle)],
  };

  return {
    ...bundle,
    entry: [
      {
        fullUrl: `urn:uuid:${diagnosticReport.id}`,
        resource: diagnosticReport,
      },
      ...bundle.entry,
    ],
  };
}