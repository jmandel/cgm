import { parse } from 'csv-parse/sync';
import moment from 'moment';
import { FHIRBundle, FHIRDevice, FHIRObservation } from './agp-calc';

interface GlucoseReading {
  Sensorid: string;
  nr: number;
  UnixTime: number;
  'YYYY-mm-dd-HH:MM:SS': string;
  TZ: string;
  Min: number;
  'mg/dL': number;
}

export const fetchAndConvertData = async (serverBase?: string) => {
  const response = await fetch((serverBase ?? (process || {})?.env?.JUGGLUCO_ENDPOINT) + '/x/history?duration=10368000&header');
  const csvData = await response.text();
  return convertData(csvData);
}

export const convertData = async (csvData: string): Promise<FHIRBundle> => {
  const records = parse(csvData, {
    columns: true,
    delimiter: "\t"
  });

  const bundle: FHIRBundle = {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [],
  };

  const deviceMap: Record<string, string> = {};

  records.forEach((reading: GlucoseReading) => {
    let { Sensorid, nr, UnixTime, TZ, 'mg/dL': glucoseValue } = reading;
    if (Sensorid.startsWith("XX")){
         Sensorid = Sensorid.slice(2);
    }

    if (!deviceMap[Sensorid]) {
      const deviceId = Sensorid;
      const deviceResource: FHIRDevice = {
        resourceType: 'Device',
        id: deviceId,
        identifier: [
          {
            system: 'https://freestylelibre.us/',
            value: Sensorid,
          },
        ],
        deviceName: [
          {
            name: `FreeStyle Libre Sensor ${Sensorid}`,
            type: 'user-friendly-name',
          },
        ],
      };

      bundle.entry.push({
        fullUrl: `https://github.com/jmandel/cgm/Device/${deviceId}`,
        resource: deviceResource,
      });

      deviceMap[Sensorid] = deviceId;
    }

    const observationId = `${Sensorid}_${nr}`;
    const observationResource: FHIRObservation = {
      resourceType: 'Observation',
      id: observationId,
      status: 'final',
      identifier: [
        {
          system: `https://freestylelibre.us#${Sensorid}`,
          value: nr.toString(),
        },
      ],
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '99504-3',
            display: 'Glucose [Mass/volume] in Interstitial fluid',
          },
        ],
      },
      effectiveDateTime: moment.unix(UnixTime).utcOffset(TZ).toISOString(true),
      valueQuantity: {
        value: glucoseValue,
        unit: 'mg/dL',
        system: 'http://unitsofmeasure.org',
        code: 'mg/dL',
      },
      device: {
        reference: `https://github.com/jmandel/cgm/Device/${deviceMap[Sensorid]}`,
      },
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'laboratory',
              display: 'Laboratory',
            },
          ],
        },
      ],
    };

    bundle.entry.push({
      fullUrl: `https://github.com/jmandel/cgm/Observation/${observationId}`,
      resource: observationResource,
    });
  });

  return bundle;
};

// if bun.js is being execute on cli

if (import.meta.url === `file://${process.argv[1]}`)  {
    fetchAndConvertData().then(r => console.log(JSON.stringify(r, null, 2))).catch(console.error);
}