import { KEYS, storeValue, getValue } from "./idb";

(async function () {
  const jugglucoSourceUrl = document.createElement("input");
  jugglucoSourceUrl.placeholder = "Enter Juggluco URL";
  jugglucoSourceUrl.value = (await getValue(KEYS.syncURL)) as string;
  document.body.appendChild(jugglucoSourceUrl);

  const githubPAT = document.createElement("input");
  githubPAT.placeholder = "Enter Granular PAT for writes";
  githubPAT.value = (await getValue(KEYS.accessToken)) as string;
  document.body.appendChild(githubPAT);


  const button = document.createElement("button");
  button.innerText = "Sync and schedule";
  button.onclick = async () => {
    const sw = await navigator.serviceWorker.getRegistration();
    await storeValue(KEYS.syncURL, jugglucoSourceUrl.value);
    await storeValue(KEYS.accessToken, githubPAT.value);
    await sw.periodicSync.unregister("glucose-sync");
    const r = await sw.periodicSync.register("glucose-sync", { minInterval: 10 });
    console.log("made", r);
    window.r = r;
    sw?.active?.postMessage("sync");
    console.log("POsted a sync request", sw?.active)
  };
  document.body.appendChild(button);
})();

let base = import.meta.env.BASE_URL;
if (!base.endsWith("/")) {
    base = base + "/";
}
navigator.serviceWorker
  .register(`${base}sw.js`, { type: "module" })
  .then(function (registration) {
    console.log("Service Worker registered with scope:", registration.scope);
    window.reg = registration;
  })
  .catch(function (error) {
    console.log("Service Worker registration failed:", error);
  });
//
