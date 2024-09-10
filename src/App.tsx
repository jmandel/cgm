import { useEffect, useRef, useState } from "react";
import AGP from "./AGP";
import { CGMData, FHIRBundle } from "./agp-calc";
import * as shlink from "shlinker";

import moment from 'moment';

function extractAnalysisPeriod(bundle: FHIRBundle, data: CGMData[]) {
  const analysisEntry = bundle.entry.find(
    (entry) =>
      entry.resource.resourceType === "Observation" &&
      entry.resource.code.coding.some((coding) => coding.code === "ambulatory-glucose-profile")
  );

  if (analysisEntry) {
    return (analysisEntry.resource as any).effectivePeriod;
  }

  const firstMeasurementDate = moment(data.at(0)?.timestamp || "");
  const lastMeasurementDate = moment(data.at(-1)?.timestamp || "");

  return {
    start: firstMeasurementDate.format('YYYY-MM-DD'),
    end: lastMeasurementDate.format('YYYY-MM-DD'),
  };
}

function extractCGMData(bundle: FHIRBundle) {
  const cgmData: CGMData[] = [];

  bundle.entry.forEach((entry) => {
    if (
      entry.resource.resourceType === "Observation" &&
      entry.resource.code.coding.some((coding) => coding.code === "99504-3")
    ) {
      const observation = entry.resource;
      const glucoseValue = observation.valueQuantity!.value;
      const unit = observation.valueQuantity!.unit;
      const timestamp = new Date(observation.effectiveDateTime!);

      cgmData.push({
        timestamp,
        glucoseValue,
        unit: unit as "mg/dL" | "mmol/L",
      });
    }
  });

  cgmData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return cgmData;
}

declare global {
  interface Window {
    inject: (url: string) => Promise<void>;
  }
}

const SHLinkComponent = () => {
  const [currentShlink, setCurrentShlink] = useState<shlink.SHLinkData | null>(null);
  const [currentShlinkReady, setCurrentShlinkReady] = useState(false);

  useEffect(() => {
    const parseSHLink = async () => {
      window.inject = async (url: string) => {
        const data = await ( await fetch(url)).json()
        setCurrentShlink(data);
        setCurrentShlinkReady(true);
      }
      // if (currentShlink) {

      // }
      let parsed;
      try {
        parsed = shlink.parse();
        setCurrentShlink(parsed);
      } catch (e) {
        return;
      }
      console.log("Parsed", parsed);
      const retrieved = await shlink.retrieve(parsed);
      console.log("Retrieved", retrieved);
      setCurrentShlink(retrieved);
      setCurrentShlinkReady(true);
    };
    parseSHLink();
  }, []);

  const payload = currentShlink?.files?.[0]?.contentJson;
  const cgmData = payload ? extractCGMData(payload) : null;
  const analysisPeriod = payload ? extractAnalysisPeriod(payload, cgmData!) : null;

  const widget = useRef<HTMLDivElement>(null);
  useEffect(() => {
    console.log("Widget", widget.current, currentShlinkReady);
    if (!widget || !currentShlinkReady) {
      return;
    }

    if (currentShlink?.url) {
      shlink.render(currentShlink!, widget.current!, { showDetails: true, qrStartsOpen: true });
    }
  }, [currentShlinkReady, widget.current]);

  return (
    <>
    <div className="sidebar-holder">
      {!currentShlink && (
        <div className="agp">
          <h3>SHLink CGM Viewer</h3>
          {/* <input type="text" placeholder="Enter SHLink" /> */}
          <ul>
            <li>
              <a href="https://github.com/jmandel/cgm">Site Source</a> (github.com/jmandel/cgm)
            </li>
            <li>
              <a href="./shl/index.html">Browse Sample Data</a> (SMART Health Links)
            </li>
            <li>
              <a
                target="_blank"
                href={
                  "#shlink:/eyJ1cmwiOiJodHRwczovL2pvc2h1YW1hbmRlbC5jb20vY2dtL3NobC8xMjBkYXlfYWdwX2J1bmRsZV91bmd1ZXNzYWJsZV9zaGxfaWQwMDAwMDAwIiwiZmxhZyI6IkxVIiwia2V5IjoiYWdwX29ic191bmd1ZXNzYWJsZV9yYW5kb21fa2V5MDAwMDAwMDAwMDAwMCIsImxhYmVsIjoiSm9zaCdzIENHTSBEYXRhIn0"
                }
              >
                View Sample Glucose Report
              </a>
            </li>
          </ul>
        </div>
      )}
      {currentShlink && (
          <>
            {payload ? (
              <AGP data={cgmData!} analysisPeriod={analysisPeriod!}></AGP>
            ) : (
              <>
              <div className="agp"><p>Loading and decrypting </p></div>
              </>
            )}
            {currentShlink?.url && <div className="shl-widget" ref={widget} style={{position: "sticky"}}></div> }
            </>
      )}

    </div>
    </>
  );
};

export default SHLinkComponent;
