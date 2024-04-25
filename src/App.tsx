import { useEffect, useState } from "react";
import * as jose from "jose";
import AGP from "./AGP";
import { CGMData, FHIRBundle } from "./agp-calc";

function extractAnalysisPeriod(bundle: FHIRBundle, data: CGMData[]) {
  const analysisEntry = bundle.entry.find(
    (entry) =>
      entry.resource.resourceType === "Observation" &&
      entry.resource.code.coding.some((coding) => coding.code === "ambulatory-glucose-profile")
  );
  if (analysisEntry) {
    return (analysisEntry.resource as any).effectivePeriod;
  }

  const firstMeasurementDate = new Date(data.at(0)?.timestamp || "").toISOString().slice(0, 10);
  const lastMeasurementDate = new Date(data.at(-1)?.timestamp || "").toISOString().slice(0, 10);
  return {
    start: firstMeasurementDate,
    end: lastMeasurementDate,
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
      const glucoseValue = observation.valueQuantity.value;
      const unit = observation.valueQuantity.unit;
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

const SHLinkComponent = () => {
  const [shlPayload, setDecryptedPayload] = useState(null);
  const [shlLabel, setShlLabel] = useState(null);
  const [currentShlink, setCurrentShlink] = useState<string | null>(null);

  useEffect(() => {
    const parseSHLink = async () => {
      const hash = window.location.hash;
      const tag = "#shlink:/";
      if (hash.startsWith(tag)) {
        setCurrentShlink(hash.slice(1));
        const encodedPayload = hash.slice(tag.length);
        const decodedPayload = jose.base64url.decode(encodedPayload);
        const shlinkPayload = JSON.parse(new TextDecoder().decode(decodedPayload));
        setShlLabel(shlinkPayload.label);

        if (shlinkPayload.flag && shlinkPayload.flag.includes("U")) {
          try {
            const response = await fetch(shlinkPayload.url + "?recipient=cgm-viewer", {
              method: "GET",
            });

            if (response.ok) {
              const encryptedFile = await response.text();
              const decrypted = await jose.compactDecrypt(encryptedFile, jose.base64url.decode(shlinkPayload.key));
              const payload = JSON.parse(new TextDecoder().decode(decrypted.plaintext));
              window.payload = payload;
              setDecryptedPayload(payload);
            } else {
              console.error("Error retrieving file:", response.status);
            }
          } catch (error) {
            console.error("Error retrieving file:", error);
          }
        } else {
          console.log('SHLink does not have a "U" flag');
        }
      }
    };

    parseSHLink();
  }, []);

  const cgmData = shlPayload ? extractCGMData(shlPayload) : null;
  const analysisPeriod = shlPayload ? extractAnalysisPeriod(shlPayload, cgmData!) : null;

  return (
    <>
      {!shlLabel && !shlPayload && (
        <>
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
                View Sample AGP
              </a>
            </li>
          </ul>
        </>
      )}
      {currentShlink && (
        <>
          {shlLabel && <h3>{shlLabel}</h3>}
          <div>
            {shlPayload ? (
              <AGP data={cgmData!} analysisPeriod={analysisPeriod!}></AGP>
            ) : (
              <p>No decrypted payload available</p>
            )}
          </div>
        </>
      )}
    </>
  );
};

export default SHLinkComponent;
