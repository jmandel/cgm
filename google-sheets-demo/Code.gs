function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Glucose Tracker")
    .addItem("Open Glucose Tracker", "showSidebar")
    .addToUi();
}

function showSidebar() {
  const template = HtmlService.createTemplateFromFile("index");
  template.shl = SpreadsheetApp.getActive()
    .getActiveSheet()
    .getActiveCell()
    .getValue();
  var html = template.evaluate()
    .setTitle("Glucose Tracker")
    .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

function processObservations(observations) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Clear existing data
  sheet.clear();
  
  // Set headers
  sheet.getRange(1, 1, 1, 4).setValues([['Time', 'LOINC Code', 'Value', 'Unit']]);
  
  // Add data
  const data = observations.map(obs => [obs.time, obs.code, obs.value, obs.unit]);
  sheet.getRange(2, 1, data.length, 4).setValues(data);
  
  // Auto-resize columns
  sheet.autoResizeColumns(1, 4);
}
