import { FHIRBundle, FHIRDiagnosticReport, FHIRObservation } from "../agp-calc";
import { v4 as uuidv4 } from "uuid";
import renderToAttachment from "../render-pdf";

export async function generateDiagnosticReport(bundle: FHIRBundle): Promise<FHIRBundle> {
  const agpObservations = bundle.entry.filter(
    (entry) =>
      entry.resource.resourceType === "Observation" &&
      entry.resource.code.coding.some((coding) => coding.code === "ambulatory-glucose-profile")
  ) as { fullUrl: string; resource: FHIRObservation }[];

  let newEntries = [];
  for (const agpObs of agpObservations) {
    const effectivePeriod = {
      start: agpObs.resource.effectivePeriod!.start,
      end: agpObs.resource.effectivePeriod!.end,
    };

    console.log("For", agpObs)
    newEntries.push({
      resourceType: "DiagnosticReport",
      id: uuidv4(),
      status: "final",
      code: {
        coding: [
          {
            system: "https://tx.argo.run",
            code: "ambulatory-glucose-profile",
            display: "Ambulatory Glucose Profile",
          },
        ],
      },
      effectivePeriod,
      result: agpObs.resource.hasMember!,
      presentedForm: [await renderToAttachment({ ...bundle, entry: [agpObs, ...bundle.entry] })],
    } as FHIRDiagnosticReport);
  }

  return {
    ...bundle,
    entry: [
      ...newEntries.map((diagnosticReport) => ({
        fullUrl: `urn:uuid:${diagnosticReport.id}`,
        resource: diagnosticReport,
      })),
      ...bundle.entry,
    ],
  };
}
