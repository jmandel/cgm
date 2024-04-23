# CGM Data in FHIR: Playground for Visualization and Sharing

This project demonstrates how to represent Continuous Glucose Monitoring (CGM) data using the FHIR standard, generate an Ambulatory Glucose Profile (AGP) from the CGM data, and share the data using a SMART Health Link.

## Overview

The project consists of the following main components:

* CGM Data Parsing: The parseCSV function in parseCSV.ts reads a CSV file containing CGM data and converts it into a FHIR Bundle resource. The Bundle resource includes Device and Observation resources representing the CGM device and glucose readings, respectively.
* AGP Generation: The AGPReport component in AGP.tsx takes the parsed CGM data as input and generates an Ambulatory Glucose Profile (AGP) visualization. The AGP includes various charts and metrics, such as the glucose profile chart, glucose statistics, time in ranges, and daily glucose profiles.
* SMART Health Link Integration: The createEncryptedHealthCard function in createEncryptedHealthCard.ts encrypts the FHIR Bundle containing the CGM data and generates a SMART Health Link. The SMART Health Link allows sharing the encrypted CGM data with other applications or individuals.
