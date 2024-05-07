import { spawn } from "child_process";
import express from "express";
import fs from "fs";
import { chromium } from "playwright";
import serveStatic from "serve-static";

var app = express();
const PORT = 3030;
const baseUrl = "http://localhost:" + PORT;

app.use(serveStatic("dist", { index: ["index.html"] }));

let injectedJson: any = null;
app.get("/bundle.json", (_req, res) => {
  // respond in json with injectedJson
  res.json(injectedJson);
});

let server: any;

async function buildApp():Promise<void> {
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

async function renderPDF(url: any) {

  if (!url?.startsWith?.("shlink:/") && !url?.startsWith?.("./") && typeof url !== "object") {
    throw new Error("Invalid URL. Please provide a shlink:/ or a relative path to a JSON file.");
  }

  let targetUrl;
  if (typeof url === "object" || typeof url === "string" && !url.startsWith("shlink:/")) {
    targetUrl = `${baseUrl}/index.html`;
  } else {
    targetUrl = baseUrl + "#" + url;
  }


  console.error("Open browser");
  const browser = await chromium.launch({
    // headless: false
  });

  console.error("NEw page");
  const page = await browser.newPage();
  console.error("Navigating");

  await page.goto(targetUrl);

  console.error("Navigated");
  if (!url?.includes?.("shlink:/")) {
    const glucoseData = typeof url === 'object'  ? url : JSON.parse(fs.readFileSync(url, "utf8"));
    console.error("Inject", Object.keys(glucoseData), glucoseData?.entry?.length)
    injectedJson = { label: "Glucose Data", totalFileSize: 0,  files: [{ contentJson: glucoseData, size: JSON.stringify(glucoseData).length }] }
    const jsonUrl = `${baseUrl}/bundle.json`;
    await page.evaluate((jsonUrl) => {
      window.inject(jsonUrl);
    }, jsonUrl);
    console.error("Waiting for svg")
    await page.waitForSelector(".agp > svg");
    injectedJson = {}
  }

  console.error("waiting for network idle");
  await page.waitForLoadState("networkidle");
  console.error("Printing");
  const pdfBytes = await page.pdf({
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
  return pdfBytes.toString("base64");
}

async function renderPDFInChildProcess(bundle: any): Promise<string> {
  return new Promise((resolve, reject) => {
    console.error("Spawn bun")
    const child = spawn("bun", ["run", __filename], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    child.stdin.write(JSON.stringify(bundle));
    console.error("Wrote to child")
    child.stdin.end();

    let base64Data = '';
    child.stdout.on('data', (data) => {
      base64Data += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(base64Data);
      } else {
        reject(new Error(`Child process exited with code ${code}`));
      }
    });
  });
}

export default async function renderToAttachment(bundle: any) {
  await buildApp();

  try {
    const data = await renderPDFInChildProcess(bundle);
    return {
      contentType: 'application/pdf',
      data: data.trim(),
      title: 'Ambulatory Glucose Profile Report',
      creation: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  server = app.listen(PORT);

  let arg = await new Promise((resolve, reject) => {
    if (process.argv.length > 2) {
      resolve(process.argv[2]);
    }
    let bundleJson = '';
    process.stdin.on('data', (data) => {
      bundleJson += data.toString();
    });
    process.stdin.on('end', () => {
      console.error("Data gathered through stdin")
      resolve(JSON.parse(bundleJson));
    })
  });

  console.error("rendrein with,", typeof arg)
  const res = await renderPDF(arg); 

  await new Promise((resolve) => {
    server.close(resolve)
  })
  console.log(res);
}