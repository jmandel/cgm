import * as d3 from "d3";
import { v4 as uuidv4 } from "uuid";
import moment from "moment";

export interface AGPMetrics {
  median: number;
  timeInRanges: {
    veryLow: number;
    low: number;
    target: number;
    high: number;
    veryHigh: number;
  };
  glucoseStatistics: {
    mean: number;
    gmi: number;
    cv: number;
  };
  totalDays: number;
  sensorActivePercentage: number;
}

export interface CGMData {
  timestamp: Date;
  glucoseValue: number;
  unit: "mg/dL" | "mmol/L";
}

export interface Breakpoints {
  unit: string;
  veryLow: number;
  low: number;
  high: number;
  veryHigh: number;
}

export interface FHIRBundle {
  resourceType: "Bundle";
  type: "collection";
  entry: Array<{
    fullUrl: string;
    resource: FHIRDevice | FHIRObservation;
  }>;
}

export interface FHIRDevice {
  resourceType: "Device";
  id: string;
  identifier: Array<{
    system: string;
    value: string;
  }>;
  deviceName: Array<{
    name: string;
    type: "user-friendly-name";
  }>;
}

interface FHIRObservation {
  resourceType: "Observation";
  id: string;
  status: "final";
  code: {
    coding: Array<{
      system: string;
      code: string;
      display?: string;
    }>;
  };
  effectiveDateTime?: string;
  effectivePeriod?: { start: string; end: string };
  valueQuantity: {
    value: number;
    unit: string;
    system: "http://unitsofmeasure.org";
    code: string;
  };
  device?: {
    reference: string;
  };
  category: Array<{
    coding: Array<{
      system: "http://terminology.hl7.org/CodeSystem/observation-category";
      code: "laboratory";
      display: "Laboratory";
    }>;
  }>;
  component?: Array<Partial<FHIRObservation>>;
}

export const convertGlucoseValue = (value: number, fromUnit: string, toUnit: string): number => {
  if (fromUnit === toUnit) return value;
  if (fromUnit === "mg/dL" && toUnit === "mmol/L") return value / 18;
  if (fromUnit === "mmol/L" && toUnit === "mg/dL") return value * 18;
  throw new Error("Invalid units");
};

const getTimeInRange = (data: CGMData[], minValue: number, maxValue: number, unit: string) => {
  const totalReadings = data.length;
  const readingsInRange = data.filter((d) => {
    const glucoseValue = convertGlucoseValue(d.glucoseValue, d.unit, unit);
    return glucoseValue >= minValue && glucoseValue <= maxValue;
  }).length;
  const percentage = (readingsInRange / totalReadings) * 100;
  return percentage;
};

const calculateSensorActivePercentage = (data: CGMData[], analysisPeriod: AnalysisPeriod): number => {
  const start = new Date(analysisPeriod.start);
  const end = new Date(analysisPeriod.end);

  const totalHours = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600));

  // Create an array to store the count of measurements for each hour
  const hourlyMeasurementCounts = new Array(totalHours).fill(0);

  // Iterate through the data once and increment the count for each corresponding hour
  data.forEach((d) => {
    const hourIndex = Math.floor((d.timestamp.getTime() - start.getTime()) / (1000 * 3600));
    if (hourIndex >= 0 && hourIndex < totalHours) {
      hourlyMeasurementCounts[hourIndex]++;
    }
  });

  // Count the number of hours with at least one measurement
  const hoursWithMeasurements = hourlyMeasurementCounts.reduce(
    (count, measurementCount) => (measurementCount > 0 ? count + 1 : count),
    0
  );

  // Calculate the sensor active percentage
  const sensorActivePercentage = (hoursWithMeasurements / totalHours) * 100;

  return sensorActivePercentage;
};

export const calculateAGPMetrics = (
  data: CGMData[],
  analysisPeriod: AnalysisPeriod,
  breakpoints: Breakpoints
): AGPMetrics => {
  const unit = breakpoints.unit;
  const glucoseValues = data.map((d) => ({
    value: d.glucoseValue,
    unit: d.unit,
  }));
  const median =
    d3.quantile(
      glucoseValues.map((d) => convertGlucoseValue(d.value, d.unit, unit)),
      0.5
    ) || 0;

  const timeInRanges = {
    veryLow: getTimeInRange(data, 0, breakpoints.veryLow, unit),
    low: getTimeInRange(data, breakpoints.veryLow, breakpoints.low, unit),
    target: getTimeInRange(data, breakpoints.low, breakpoints.high, unit),
    high: getTimeInRange(data, breakpoints.high, breakpoints.veryHigh, unit),
    veryHigh: getTimeInRange(data, breakpoints.veryHigh, Infinity, unit),
  };

  const glucoseStatistics = {
    mean: d3.mean(glucoseValues.map((d) => convertGlucoseValue(d.value, d.unit, unit))) || 0,
    gmi: calculateGMI(glucoseValues.map((d) => convertGlucoseValue(d.value, d.unit, "mg/dL"))),
    cv: calculateCV(glucoseValues.map((d) => convertGlucoseValue(d.value, d.unit, unit))),
  };

  console.log("glucoseStatistics", glucoseStatistics);
  // This assumes the data hae already been filtered for the analysis period.
  const totalDays = new Set(data.map((d) => d.timestamp.toISOString().slice(0, 10))).size;

  const sensorActivePercentage = calculateSensorActivePercentage(data, analysisPeriod);

  return {
    median,
    timeInRanges,
    glucoseStatistics,
    totalDays,
    sensorActivePercentage,
  };
};

const calculateGMI = (glucoseValues: number[]) => {
  const mean = d3.mean(glucoseValues) || 0;
  return 3.31 + 0.02392 * mean;
};

const calculateCV = (glucoseValues: number[]) => {
  const mean = d3.mean(glucoseValues) || 0;
  const sd = d3.deviation(glucoseValues) || 0;
  return (sd / mean) * 100;
};

export function makeBreakpoints(toUnit: "mg/dL" | "mmol/L"): Breakpoints {
  return {
    unit: toUnit,
    veryLow: convertGlucoseValue(54, "mg/dL", toUnit),
    low: convertGlucoseValue(70, "mg/dL", toUnit),
    high: convertGlucoseValue(180, "mg/dL", toUnit),
    veryHigh: convertGlucoseValue(250, "mg/dL", toUnit),
    // testing ranges for more variability in normal data
    // veryLow: convertGlucoseValue(100, "mg/dL", toUnit),
    // low: convertGlucoseValue(110, "mg/dL", toUnit),
    // high: convertGlucoseValue(120, "mg/dL", toUnit),
    // veryHigh: convertGlucoseValue(140, "mg/dL", toUnit),
  };
}

const createComponent = (
  system: string,
  code: string,
  display: string,
  value: number,
  unit: string,
  unitCode: string,
  loincCode?: string,
  loincDisplay?: string
): Exclude<FHIRObservation["component"], undefined>[number] => ({
  code: {
    coding: [
      {
        system,
        code,
        display,
      },
      ...(loincCode
        ? [
            {
              system: "http://loinc.org",
              code: loincCode,
              display: loincDisplay,
            },
          ]
        : []),
    ],
  },
  valueQuantity: {
    value: Math.round((value + Number.EPSILON) * 100) / 100,
    unit,
    system: "http://unitsofmeasure.org",
    code: unitCode || unit,
  },
});

export interface AnalysisPeriod {
  start: string;
  end: string;
  trailingDays?: number;
}
interface GenerateAGPReportArgs {
  bundle: FHIRBundle;
  analysisPeriod?: Partial<AnalysisPeriod>[];
  includeSourceData?: boolean;
  targetUnit?: "mg/dL" | "mmol/L";
  breakpoints?: Breakpoints;
}

export const generateAGPReportBundle = ({
  bundle,
  analysisPeriod = [{ trailingDays: 120 }],
  includeSourceData = true,
  targetUnit = "mg/dL",
  breakpoints = undefined,
}: GenerateAGPReportArgs): FHIRBundle => {
  const outputBundle: FHIRBundle = {
    resourceType: "Bundle",
    type: "collection",
    entry: [],
  };

  let earliestAnalysisDate;
  let latestAnalysisDate;
  const observationsBetween = (startDate: moment.Moment, endDate: moment.Moment) =>
    bundle.entry
      .filter((entry) => entry.resource.resourceType === "Observation")
      .filter(({ resource: observation }) => {
        const obs = observation as FHIRObservation;
        return (
          obs.code.coding.some((c) => c.code === "99504-3") &&
          obs.valueQuantity &&
          obs.effectiveDateTime &&
          moment(obs.effectiveDateTime).isBetween(startDate, endDate, "day", "[]")
        );
      }) as { fullUrl: string; resource: FHIRObservation }[];

  if (analysisPeriod.length === 0) {
    throw new Error("At least one analysis period must be provided");
  }
  for (const oneAnalysisPeriod of analysisPeriod) {
    let startDate: moment.Moment;
    let endDate: moment.Moment;
    if (oneAnalysisPeriod.start && oneAnalysisPeriod.end) {
      startDate = moment(oneAnalysisPeriod.start);
      endDate = moment(oneAnalysisPeriod.end);
    } else if (oneAnalysisPeriod.trailingDays) {
      endDate = moment();
      startDate = moment().subtract(oneAnalysisPeriod.trailingDays, "days");
    } else {
      throw new Error("Invalid analysis period");
    }

    if (!earliestAnalysisDate || startDate.isBefore(earliestAnalysisDate)) {
      earliestAnalysisDate = startDate;
    }
    if (!latestAnalysisDate || endDate.isAfter(latestAnalysisDate)) {
      latestAnalysisDate = endDate;
    }

    console.log("startDate", startDate);
    console.log("endDate", endDate);

    const filteredObservations: { fullUrl: string; resource: FHIRObservation }[] = observationsBetween(
      startDate,
      endDate
    );
    const glucoseObservations: CGMData[] = filteredObservations
      .map((e) => e.resource)
      .map((observation) => ({
        timestamp: moment(observation.effectiveDateTime).toDate(),
        glucoseValue: observation.valueQuantity.value,
        unit: observation.valueQuantity.code as "mg/dL" | "mmol/L",
        deviceDetails: observation.device?.reference || "",
      }));

    console.log("glucoseObservations", glucoseObservations);
    const agpMetrics = calculateAGPMetrics(
      glucoseObservations,
      { start: startDate.toISOString(), end: endDate.toISOString() },
      breakpoints || makeBreakpoints(targetUnit)
    );

    const agpObservation: FHIRObservation = {
      resourceType: "Observation",
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
      effectivePeriod: { start: startDate.toISOString().slice(0, 10), end: endDate.toISOString().slice(0, 10) },
      valueQuantity: {
        value: agpMetrics.median,
        unit: targetUnit,
        system: "http://unitsofmeasure.org",
        code: targetUnit,
      },
      category: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "laboratory",
              display: "Laboratory",
            },
          ],
        },
      ],
      component: [
        createComponent(
          "https://tx.argo.run",
          "time-in-very-low",
          "Time in Very Low Range",
          agpMetrics.timeInRanges.veryLow,
          "%",
          "%"
        ),
        createComponent(
          "https://tx.argo.run",
          "time-in-low",
          "Time in Low Range",
          agpMetrics.timeInRanges.low,
          "%",
          "%"
        ),
        createComponent(
          "https://tx.argo.run",
          "time-in-target",
          "Time in Target Range",
          agpMetrics.timeInRanges.target,
          "%",
          "%"
        ),
        createComponent(
          "https://tx.argo.run",
          "time-in-high",
          "Time in High Range",
          agpMetrics.timeInRanges.high,
          "%",
          "%"
        ),
        createComponent(
          "https://tx.argo.run",
          "time-in-very-high",
          "Time in Very High Range",
          agpMetrics.timeInRanges.veryHigh,
          "%",
          "%"
        ),
        createComponent(
          "https://tx.argo.run",
          "mean-glucose",
          "Mean Glucose",
          agpMetrics.glucoseStatistics.mean,
          targetUnit,
          targetUnit,
          "97507-8",
          "Average glucose [Mass/volume] in Interstitial fluid during Reporting Period"
        ),
        createComponent(
          "https://tx.argo.run",
          "gmi",
          "Glucose Management Indicator (GMI)",
          agpMetrics.glucoseStatistics.gmi,
          "%",
          "%",
          "97506-0",
          "Glucose management indicator"
        ),
        createComponent(
          "https://tx.argo.run",
          "cv",
          "Coefficient of Variation (CV)",
          agpMetrics.glucoseStatistics.cv,
          "%",
          "%"
        ),
        createComponent("https://tx.argo.run", "total-days", "Days", agpMetrics.totalDays, "days", "d"),
        createComponent(
          "https://tx.argo.run",
          "sensor-active-percentage",
          "Sensor Active Percentage",
          agpMetrics.sensorActivePercentage,
          "%",
          "%",
          "97510-2",
          "Glucose measurements in range out of Total glucose measurements during reporting period"
        ),
      ],
    };

    outputBundle.entry.push({
      fullUrl: "urn:uuid:" + agpObservation.id,
      resource: agpObservation,
    });
  }

  const filteredObservations = observationsBetween(earliestAnalysisDate!, latestAnalysisDate!);

  if (includeSourceData) {
    const uniqueDeviceReferences = new Set(filteredObservations.map((obs) => obs.resource.device?.reference));
    bundle.entry
      .filter(
        (entry) =>
          uniqueDeviceReferences.has(entry.fullUrl) ||
          (entry.resource.resourceType === "Device" && uniqueDeviceReferences.has(`Device/${entry.resource.id}`))
      )
      .forEach((entry) => {
        outputBundle.entry.push(entry);
      });
  }

  filteredObservations.forEach((obs: any) => {
    outputBundle.entry.push(obs);
  });

  return outputBundle;
};