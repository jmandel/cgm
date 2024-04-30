import { chromium } from "playwright";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express from "express";
import serveStatic from "serve-static";
import fs from "fs";
import { reject } from "lodash";
import { type } from "os";

var app = express();
const PORT = 3030;
const baseUrl = "http:/localhost:" + PORT;

app.use(serveStatic("dist", { index: ["index.html"] }));

let injectedJson = null;
app.get("/bundle.json", (req, res) => {
  // respond in json with injectedJson
  res.json(injectedJson);
});
let server;


async function buildApp() {
  return new Promise((resolve, reject) => {
    const buildProcess = spawn("bun", ["run", "build"], {
      stdio: "inherit",
      shell: true,
    });

    buildProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build process exited with code ${code}`));
      }
    });
  });
}

async function renderPDF(url, outputFile) {

  if (!url?.startsWith?.("shlink:/") && !url?.startsWith?.("./") && typeof url !== "object") {
    throw new Error("Invalid URL. Please provide a shlink:/ or a relative path to a JSON file.");
  }

  let targetUrl;
  if (typeof url === "object" || typeof url === "string" && !url.startsWith("shlink:/")) {
    targetUrl = `${baseUrl}/index.html`;
  } else {
    targetUrl = baseUrl + "#" + url;
  }


  console.log("Open browser");
  const browser = await chromium.launch({
    // headless: false
  });

  console.log("NEw page");
  const page = await browser.newPage();
  console.log("Navigating");

  await page.goto(targetUrl);

  console.log("Navigated");
  if (!url?.includes?.("shlink:/")) {
    const glucoseData = typeof url === 'object'  ? url : JSON.parse(fs.readFileSync(url, "utf8"));
    console.log("Inject", Object.keys(glucoseData), glucoseData.entry.length)
    injectedJson = { label: "Glucose Data", files: [{ contentJson: glucoseData, size: JSON.stringify(glucoseData).length }] }
    const jsonUrl = `${baseUrl}/bundle.json`;
    await page.evaluate((jsonUrl) => {
      window.inject(jsonUrl);
    }, jsonUrl);
    console.log("Waiting for svg")
    await page.waitForSelector(".agp > svg");
  }

  await page.waitForLoadState("networkidle");
  console.log("Printing");
  await page.pdf({
    path: outputFile,
    format: "Letter",
    margin: {
      top: "20px",
      right: "20px",
      bottom: "20px",
      left: "20px",
    },
    printBackground: false,
    footerTemplate: "", // Add this line to disable the URL in the footer
    scale: 1,
  });

  await browser.close();
}

export default async function renderToAttachment(bundle, outputFile="temp-output.pdf") {
  server = app.listen(PORT);
  await buildApp();
  await renderPDF(bundle, outputFile);
  await new Promise((resolve, reject) => {
    server.close(resolve)
  })
  const data = fs.readFileSync(outputFile).toString("base64");
  const ret = {
    contentType: "application/pdf",
    data,
    title: "Ambulatory Glucose Profile Report",
    creation: new Date().toISOString(),
  };
  return ret;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , relativeUrl, outputFile] = process.argv;

  if (!relativeUrl || !outputFile) {
    console.error("Please provide the relative URL and output file name.");
    process.exit(1);
  }

  server = app.listen(PORT);
  buildApp()
    .then((_) => {
      const url = `${relativeUrl}`;
      return renderPDF(url, outputFile);
    })
    .then(() => {
      console.log(`PDF generated successfully: ${outputFile}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error generating PDF:", error);
      process.exit(1);
    });
}
