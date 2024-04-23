import React, { useEffect, useState } from "react";
import * as jose from "jose";
import AGP from "./AGP";
import { set } from "lodash";

function extractCGMData(bundle) {
  const cgmData = [];

  bundle.entry.forEach((entry) => {
    if (entry.resource.resourceType === "Observation") {
      const observation = entry.resource;
      const glucoseValue = observation.valueQuantity.value;
      const unit = observation.valueQuantity.unit;
      const timestamp = new Date(observation.effectiveDateTime);
      const deviceReference = observation.device.reference;

      const deviceDetails =
        bundle.entry.find((entry) => entry.fullUrl === deviceReference)
          ?.resource?.deviceName?.[0]?.name || "";

      cgmData.push({
        timestamp,
        glucoseValue,
        unit,
        deviceDetails,
      });
    }
  });

  return cgmData;
}

const SHLinkComponent = () => {
  const [shlPayload, setDecryptedPayload] = useState(null);
  const [shlLabel, setShlLabel] = useState(null);

  useEffect(() => {
    const parseSHLink = async () => {
      const hash = window.location.hash;
      const tag = "#shlink:/";
      if (hash.startsWith(tag)) {
        const encodedPayload = hash.slice(tag.length);
        const decodedPayload = jose.base64url.decode(encodedPayload);
        const shlinkPayload = JSON.parse(
          new TextDecoder().decode(decodedPayload)
        );
        setShlLabel(shlinkPayload.label);

        if (shlinkPayload.flag && shlinkPayload.flag.includes("U")) {
          try {
            const response = await fetch(
              shlinkPayload.url + "?recipient=cgm-viewer",
              {
                method: "GET",
              }
            );

            if (response.ok) {
              const encryptedFile = await response.text();
              const decrypted = await jose.compactDecrypt(
                encryptedFile,
                jose.base64url.decode(shlinkPayload.key)
              );
              setDecryptedPayload(
                JSON.parse(new TextDecoder().decode(decrypted.plaintext))
              );
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

  return (
    <>
      {(!shlLabel && !shlPayload) && <><h3>SHLink CGM Viewer</h3>
        <input type="text" placeholder="Enter SHLink" />
        <button type="submit" onClick={() => {
          window.location.hash =  "shlink:/eyJ1cmwiOiJodHRwczovL2pvc2h1YW1hbmRlbC5jb20vY2dtL2ZpeHR1cmVzL0lvcTdGUXlFTXA4Q2NoU01CVEdMTjRrRzBLSTN5WHZfUUlhNGh3SVdrMDQiLCJmbGFnIjoiTFUiLCJrZXkiOiJ0UTgtTDBJYmx6dE14NlhqMmJMUW16b1BXcEQ2NXFhY2ZOVlJzMFN3ZGxBIiwibGFiZWwiOiJKb3NoJ3MgQ0dNIERhdGEifQ";
          window.location.reload();
        }}>Try Sample</button></>
      }
      {shlLabel && <h3>{shlLabel}</h3>}
      <div>
        {shlPayload ? (
          <AGP data={extractCGMData(shlPayload)}></AGP>
        ) : (
          <p>No decrypted payload available</p>
        )}
      </div>
    </>
  );
};

export default SHLinkComponent;
