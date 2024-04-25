import { fetchAndConvertData } from "./src/juggluco-to-fhir";
import { KEYS, storeValue, getValue } from "./src/idb";
import { Octokit } from "@octokit/core";

// import moment  from "moment-timezone";
// import { parse } from 'csv-parse/sync';
// console.log("in sw", moment, parse)
// const m = 5;
// export default m;

// self.addEventListener('install', (event: ExtendableEvent) => {
//   // Perform installation tasks, such as caching files
//   event.waitUntil(
//     caches.open('my-pwa-cache').then((cache) => {
//       return cache.addAll([
//         '/',
//         '/index.html',
//         '/manifest.json',
//         '/icon-192.png',
//         '/icon-512.png',
//         // Add other files you want to cache
//       ]);
//     })
//   );
// });


self.addEventListener("message", syncGlucose);


self.addEventListener("install", function (event) {
  console.log("Service Worker installed");
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  console.log("Service Worker activated");
});

self.addEventListener("periodicsync", function(event) {
  console.log("going to sync", event);
  syncGlucose(event);
//   if (event.tag === "glucose-sync") {
//     console.log("Syncing glucose data...");
//     //   event.waitUntil(syncGlucoseData());
//   }
});

async function syncGlucose(event) {
  console.log("SW Triggered period sync");
  console.log("SW Triggered period sync", event);
  const syncURL = (await getValue(KEYS.syncURL)) as string;
  const accessToken = await getValue(KEYS.accessToken);
  const result = await fetchAndConvertData(syncURL);
  console.log("Want to send", result, accessToken)  ;

  const octokit = new Octokit({
    auth: accessToken.trim()
  });
  console.log("Made octokit", octokit);
  let sha;
  const {owner, repo, path} = {owner: "jmandel", repo: "cgm", path: "src/example-generation/fixtures/past-120-days.fhir.json"}
  try {
    const response = await octokit.request(`GET /repos/${owner}/${repo}/contents/${path}`);
    // Extracting the SHA from the response
    console.log("Response", response);  
    sha = response.data.sha;
  } catch (error) {
    console.error("Error fetching file SHA:", error);
  }

  await octokit.request(`PUT /repos/${owner}/${repo}/contents/${path}`, {
    owner,
    repo,
    path,
    message: "Update glucose data from Juggluco to FHIR",
    committer: {
      name: "Josh Mandel",
      email: "none@none.none",
    },
    content: btoa(JSON.stringify(result, null, 2)),
    sha
  });
}