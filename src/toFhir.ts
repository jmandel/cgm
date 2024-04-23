import fs from 'fs';
import { parse } from 'csv-parse';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

interface GlucoseReading {
  device: string;
  serialNumber: string;
  deviceTimestamp: string;
  recordType: string;
  historicGlucose: number | null;
  scanGlucose: number | null;
  nonNumericRapidActingInsulin: string | null;
  rapidActingInsulin: number | null;
  nonNumericFood: string | null;
  carbohydrates: number | null;
  carbohydratesServings: number | null;
  nonNumericLongActingInsulin: string | null;
  longActingInsulin: number | null;
  notes: string | null;
  stripGlucose: number | null;
  ketone: number | null;
  mealInsulin: number | null;
  correctionInsulin: number | null;
  userChangeInsulin: number | null;
}

interface FHIRBundle {
  resourceType: 'Bundle';
  type: 'collection';
  entry: Array<{
    fullUrl: string;
    resource: FHIRDevice | FHIRObservation;
  }>;
}

interface FHIRDevice {
  resourceType: 'Device';
  id: string;
  identifier: Array<{
    system: string;
    value: string;
  }>;
  deviceName: Array<{
    name: string;
    type: 'user-friendly-name';
  }>;
}

interface FHIRObservation {
  resourceType: 'Observation';
  id: string;
  status: 'final';
  code: {
    coding: Array<{
      system: 'http://loinc.org';
      code: '99504-3';
      display: 'Glucose [Mass/volume] in Interstitial fluid';
    }>;
  };
  effectiveDateTime: string;
  valueQuantity: {
    value: number;
    unit: string;
    system: 'http://unitsofmeasure.org';
    code: string;
  };
  device: {
    reference: string;
  };
  category: Array<{
    coding: Array<{
      system: 'http://terminology.hl7.org/CodeSystem/observation-category';
      code: 'laboratory';
      display: 'Laboratory';
    }>;
  }>;
}

const parseCSV = (filePath: string): Promise<FHIRBundle> => {
  return new Promise((resolve, reject) => {
    const bundle: FHIRBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [],
    };

    let unit: 'mg/dL' | 'mmol/L' = 'mg/dL'; // Default unit
    const deviceMap: Record<string, string> = {}; // Map to store device serial numbers and their corresponding resource IDs

    fs.createReadStream(filePath)
      .pipe(parse({ delimiter: ',', fromLine: 2 })) // Start parsing from line 2 to include headers
      .on('data', (row: string[]) => {
        if (row.indexOf('Scan Glucose mg/dL') !== -1) {
          unit = 'mg/dL';
        } else if (row.indexOf('Scan Glucose mmol/L') !== -1) {
          unit = 'mmol/L';
        } else {
          const reading: GlucoseReading = {
            device: row[0],
            serialNumber: row[1],
            deviceTimestamp: row[2],
            recordType: row[3],
            historicGlucose: row[4] ? parseFloat(row[4]) : null,
            scanGlucose: row[5] ? parseFloat(row[5]) : null,
            nonNumericRapidActingInsulin: row[6] || null,
            rapidActingInsulin: row[7] ? parseFloat(row[7]) : null,
            nonNumericFood: row[8] || null,
            carbohydrates: row[9] ? parseFloat(row[9]) : null,
            carbohydratesServings: row[10] ? parseFloat(row[10]) : null,
            nonNumericLongActingInsulin: row[11] || null,
            longActingInsulin: row[12] ? parseFloat(row[12]) : null,
            notes: row[13] || null,
            stripGlucose: row[14] ? parseFloat(row[14]) : null,
            ketone: row[15] ? parseFloat(row[15]) : null,
            mealInsulin: row[16] ? parseFloat(row[16]) : null,
            correctionInsulin: row[17] ? parseFloat(row[17]) : null,
            userChangeInsulin: row[18] ? parseFloat(row[18]) : null,
          };

          if (!deviceMap[reading.serialNumber]) {
            // Device not yet added to the bundle
            const deviceResource: FHIRDevice = {
              resourceType: 'Device',
              id: uuidv4(),
              identifier: [
                {
                  system: 'http://example.com/devices',
                  value: reading.serialNumber,
                },
              ],
              deviceName: [
                {
                  name: reading.device,
                  type: 'user-friendly-name',
                },
              ],
            };

            bundle.entry.push({
              fullUrl: `urn:uuid:${deviceResource.id}`,
              resource: deviceResource,
            });

            deviceMap[reading.serialNumber] = deviceResource.id;
          }

          const glucoseValue = reading.scanGlucose || reading.historicGlucose;
          if (glucoseValue) {
            const observationResource: FHIRObservation = {
              resourceType: 'Observation',
              id: uuidv4(),
              status: 'final',
              code: {
                coding: [
                  {
                    system: 'http://loinc.org',
                    code: '99504-3',
                    display: 'Glucose [Mass/volume] in Interstitial fluid',
                  },
                ],
              },
              effectiveDateTime: moment(new Date(reading.deviceTimestamp)).toISOString(true),
              valueQuantity: {
                value: glucoseValue,
                unit: unit,
                system: 'http://unitsofmeasure.org',
                code: unit
              },
              device: {
                reference: `urn:uuid:${deviceMap[reading.serialNumber]}`,
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
              fullUrl: `urn:uuid:${observationResource.id}`,
              resource: observationResource,
            });
          }
        }
      })
      .on('end', () => {
        resolve(bundle);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

// Usage example
const csvFilePath = './src/fixtures/JoshM_glucose_4-22-2024.libreview.csv';

const glucoseData = await parseCSV(csvFilePath);

import * as jose from 'jose';
import pako from 'pako';

async function createEncryptedHealthCard(payload, key, contentType) {
  // Stringify the payload object
  const payloadString = JSON.stringify(payload);
  const payloadUncompressed  = new TextEncoder().encode(payloadString)
  // Deflate the payload using pako
  const deflatedPayload = pako.deflateRaw(payloadString);

  // Create a Uint8Array from the deflated payload
  const payloadCompressed = new Uint8Array(deflatedPayload);

  // Encrypt the deflated payload
  const encrypted = await new jose.CompactEncrypt(payloadUncompressed)
    .setProtectedHeader({
      alg: 'dir',
      enc: 'A256GCM',
      cty: contentType,
      // zip: 'DEF',
    })
    .encrypt(jose.base64url.decode(key));

  return encrypted;
}
// Example usage
const exampleContentType = 'application/fhir+json';

const shcId =  "Ioq7FQyEMp8CchSMBTGLN4kG0KI3yXv_QIa4hwIWk04" // jose.base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
const key = "tQ8-L0IblztMx6Xj2bLQmzoPWpD65qacfNVRs0SwdlA" // jose.base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
const encrypted = await createEncryptedHealthCard(glucoseData, key, exampleContentType);
fs.writeFileSync(`./src/fixtures/${shcId}`, encrypted);
const infoFile = {
  shlinkJsonPayload: {
    // LOCAL()
    // "url": "http://localhost:5173/fixtures/" + shcId,
    "url": "https://joshuamandel.com/cgm/fixtures/" + shcId,
    "flag": "LU",
    key,
    "label": "Josh's CGM Data"
  }
}

const encodedPayload = jose.base64url.encode(JSON.stringify(infoFile.shlinkJsonPayload))
const shlinkBare = `shlink:/` + encodedPayload;
// LOCAL()
// const shlink = `http://localhost:5173#` + shlinkBare
const shlink = `https://joshuamandel.com/cgm#` + shlinkBare

infoFile.shlinkBare = shlinkBare;
infoFile.shlink = shlink;

fs.writeFileSync(`./src/fixtures/${shcId}.details.json`, JSON.stringify(infoFile, null, 2));