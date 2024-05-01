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

export default async function renderToAttachment(bundle: any) {
  server = app.listen(PORT);
  await buildApp();
  let data = await renderPDF(bundle);
  await new Promise((resolve) => {
    server.close(resolve)
  })
  return {
    contentType: "application/pdf",
    data,
    title: "Ambulatory Glucose Profile Report",
    creation: new Date().toISOString(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , relativeUrl] = process.argv;

  if (!relativeUrl) {
    console.error("Please provide the relative URL.");
    process.exit(1);
  }

  server = app.listen(PORT);
  buildApp()
    .then((_) => {
      const url = `${relativeUrl}`;
      return renderPDF(url);
    })
    .then(() => {
      console.log(`PDF generated successfully`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error generating PDF:", error);
      process.exit(1);
    });
}
