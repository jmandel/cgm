import fs from 'fs';
import { parse } from 'csv-parse';

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

const parseCSV = (filePath: string): Promise<{ readingsFull: GlucoseReading[], readingsGlucose: CGMData[] }> => {
  return new Promise((resolve, reject) => {
    const readingsFull: GlucoseReading[] = [];
    const readingsGlucose: CGMData[] = [];
    let unit: "mg/dL" | "mmol/L" = "mg/dL"; // Default unit

    fs.createReadStream(filePath)
      .pipe(parse({ delimiter: ',', fromLine: 2 })) // Start parsing from line 2 to include headers
      .on('data', (row: string[]) => {
        if (row.indexOf('Scan Glucose mg/dL') !== -1) {
          unit = "mg/dL";
        } else if (row.indexOf('Scan Glucose mmol/L') !== -1) {
          unit = "mmol/L";
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
          readingsFull.push(reading);

          if (reading.historicGlucose !== null) {
            const cgmReading: CGMData = {
              timestamp: new Date(reading.deviceTimestamp),
              glucoseValue: reading.historicGlucose,
              unit: unit,
              deviceDetails: `${reading.device} (${reading.serialNumber})`,
            };
            readingsGlucose.push(cgmReading);
          }
        }
      })
      .on('end', () => {
        resolve({ readingsFull, readingsGlucose });
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};



import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import { CGMData } from './agp-calc';
// Usage example

// const csvFilePath = './src/fixtures/JoshM_glucose_4-22-2024.libreview.csv';
const argv: any = yargs(hideBin(process.argv))
    .usage('Usage: $0 -f [filename]')
    .default('csv', './src/fixtures/JoshM_glucose_4-22-2024.libreview.csv')
    .demandOption(['csv'])
    .argv;

        const csvFilePath = argv.csv as string;
        parseCSV(csvFilePath)
        .then((readings) => {
            console.log(JSON.stringify(readings.readingsGlucose, null, 2));
            // Process the parsed readings as needed
        })
        .catch((error) => {
            console.error('Error parsing CSV:', error);
        });