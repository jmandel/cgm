import React from "react";
import { useRef, useEffect } from "react";
import * as d3 from "d3";
import _ from "lodash";
import moment from "moment-timezone";

interface CGMData {
  timestamp: Date;
  glucoseValue: number;
  unit: "mg/dL" | "mmol/L";
  deviceDetails: string;
}

interface AGPChartProps {
  data: CGMData[];
  unit: "mg/dL" | "mmol/L";
  percentiles: number[];
  chunkSizeMinutes?: number;
  chartWidth?: number;
}

interface Breakpoints {
  unit: string;
  veryLow: number;
  low: number;
  high: number;
  veryHigh: number;
}

const convertGlucoseValue = (
  value: number,
  fromUnit: string,
  toUnit: string
): number => {
  if (fromUnit === toUnit) return value;
  if (fromUnit === "mg/dL" && toUnit === "mmol/L") return value / 18;
  if (fromUnit === "mmol/L" && toUnit === "mg/dL") return value * 18;
  throw new Error("Invalid units");
};

const getTimeInRange = (
  data: CGMData[],
  minValue: number,
  maxValue: number,
  unit: string
) => {
  const totalReadings = data.length;
  const readingsInRange = data.filter((d) => {
    const glucoseValue = convertGlucoseValue(d.glucoseValue, d.unit, unit);
    return glucoseValue >= minValue && glucoseValue <= maxValue;
  }).length;
  const percentage = (readingsInRange / totalReadings) * 100;
  const durationInMinutes = (readingsInRange / totalReadings) * 24 * 60;
  const hours = Math.floor(durationInMinutes / 60);
  const minutes = Math.round(durationInMinutes % 60);

  return {
    percentage,
    duration: `${hours}h ${minutes}m`,
  };
};

const calculateAGPMetrics = (data: CGMData[], breakpoints: Breakpoints) => {
  const unit = breakpoints.unit;
  const glucoseValues = data.map((d) =>
    convertGlucoseValue(d.glucoseValue, d.unit, unit)
  );
  const percentiles = [5, 25, 50, 75, 95];
  const percentileValues = percentiles.map(
    (p) => d3.quantile(glucoseValues, p / 100) || 0
  );
  const median = percentileValues[2];

  const timeInRanges = {
    veryLow: getTimeInRange(data, 0, breakpoints.veryLow, unit),
    low: getTimeInRange(data, breakpoints.veryLow, breakpoints.low, unit),
    target: getTimeInRange(data, breakpoints.low, breakpoints.high, unit),
    high: getTimeInRange(data, breakpoints.high, breakpoints.veryHigh, unit),
    veryHigh: getTimeInRange(data, breakpoints.veryHigh, Infinity, unit),
  };

  const glucoseStatistics = {
    mean: d3.mean(glucoseValues) || 0,
    gmi: calculateGMI(glucoseValues),
    cv: calculateCV(glucoseValues),
  };

  return {
    percentiles: {
      "5th": percentileValues[0],
      "25th": percentileValues[1],
      "50th": percentileValues[2],
      "75th": percentileValues[3],
      "95th": percentileValues[4],
    },
    median,
    targetRange: {
      low: breakpoints.low,
      high: breakpoints.high,
    },
    timeInRanges,
    glucoseStatistics,
  };
};

const calculateGMI = (glucoseValues: number[]) => {
  const mean = d3.mean(glucoseValues) || 0;
  return 3.31 + 0.02392 * mean;
};

const calculateCV = (glucoseValues: number[]) => {
  const mean = d3.mean(glucoseValues) || 0;
  const sd = d3.deviation(glucoseValues) || 0;
  return (sd / mean) * 100;
};

const renderAGPChart = (
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  data: CGMData[],
  width: number,
  height: number,
  margin: { top: number; right: number; bottom: number; left: number },
  percentiles: number[] = [5, 25, 50, 75, 95],
  chunkSizeMinutes: number = 15, // Chunk size of 15 minutes
  unit: "mg/dL" | "mmol/L"
) => {
  const tooltip = svg
    .append("g")
    .attr("class", "tooltip")
    .style("display", "none");

  tooltip.append("rect").attr("fill", "white").attr("stroke", "black");

  const tooltipText = tooltip.append("text").attr("class", "tooltip-text");

  const addTooltipText = (text: string) => {
    tooltipText.append("tspan").attr("x", 0).attr("dy", "1.2em").text(text);
  };

  const targetBreakpoints = makeBreakpoints(unit);
  console.log("Target Breakpoints: ", targetBreakpoints, unit);
  const targetRanges = [
    targetBreakpoints.veryLow,
    targetBreakpoints.low,
    targetBreakpoints.high,
    targetBreakpoints.veryHigh,
  ];

  const xScale = d3.scaleTime().range([0, width]);
  const yScale = d3.scaleLinear().range([height, 0]);

  const chartGroup = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  xScale.domain([new Date(0, 0, 0, 0, 0), new Date(0, 0, 0, 23, 59)]);
  yScale.domain([
    targetBreakpoints.veryLow * 0.9,
    targetBreakpoints.veryHigh * 1.1,
  ]);

  const chunkCount = Math.ceil((24 * 60) / chunkSizeMinutes);
  const buckets: CGMData[][] = Array.from({ length: chunkCount }, () => []);

  data.forEach((d) => {
    const minutesSinceMidnight =
      d.timestamp.getHours() * 60 + d.timestamp.getMinutes();
    const chunkIndex = Math.floor(minutesSinceMidnight / chunkSizeMinutes);
    buckets[chunkIndex].push(d);
  });

  const percentileData = buckets.map((bucket) => {
    const glucoseValues = bucket.map((d) =>
      convertGlucoseValue(d.glucoseValue, d.unit, unit)
    );
    return percentiles.map((p) => d3.quantile(glucoseValues, p / 100) || 0);
  });

  const lineGenerator = d3
    .line<[number, number]>()
    .x(([minutesSinceMidnight]) =>
      xScale(new Date(0, 0, 0, 0, minutesSinceMidnight))
    )
    .y(([, glucoseValue]) => yScale(glucoseValue))
    .curve(d3.curveBasis);

  const areaGenerator = d3
    .area()
    .x(([minutesSinceMidnight]) =>
      xScale(new Date(0, 0, 0, 0, minutesSinceMidnight))
    )
    .y0(([chunkIndex, d]) => yScale(d[0])) // 5th percentile for the upper area
    .y1(([chunkIndex, d]) => yScale(d[4])) // 95th percentile for the upper area
    .curve(d3.curveBasis);

  // Create the upper shaded area (5th to 95th percentile)
  chartGroup
    .append("path")
    .datum(
      percentileData.map((d, chunkIndex) => [chunkIndex * chunkSizeMinutes, d])
    ) // Bind percentile data
    .attr("fill", "#0F9D5822")
    .attr("d", areaGenerator);

  areaGenerator
    .y0(([chunkIndex, d]) => yScale(d[1])) // 25th percentile for the lower area
    .y1(([chunkIndex, d]) => yScale(d[3])); // 75th percentile for the lower area

  chartGroup
    .append("path")
    .datum(
      percentileData.map((d, chunkIndex) => [chunkIndex * chunkSizeMinutes, d])
    ) // Bind percentile data
    .attr("fill", "#0F9D5866")
    .attr("d", areaGenerator);

  percentiles.forEach((p, i) => {
    const line = chartGroup
      .append("path")
      .attr("fill", "none")
      .attr("stroke", "black")
      .attr(
        "d",
        lineGenerator(
          percentileData.map((d, chunkIndex) => [
            chunkIndex * chunkSizeMinutes,
            d[i],
          ])
        )
      );

    if (i === 2) {
      line.attr("stroke-width", 1);
    } else {
      line.attr("stroke-width", 0);
    }
    // Create the middle shaded area (25th to 75th percentile)
  });

  // Horizontal lines for target ranges
  targetRanges.forEach((range) => {
    chartGroup
      .append("line")
      .attr("x1", xScale(new Date(0, 0, 0, 0, 0)))
      .attr("y1", yScale(range))
      .attr("x2", xScale(new Date(0, 0, 0, 23, 59)))
      .attr("y2", yScale(range))
      .attr("stroke", "red")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "5,5");
  });

  chartGroup
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale).ticks(12).tickFormat(d3.timeFormat("%H:%M")));

  chartGroup.append("g").call(d3.axisLeft(yScale));

  chartGroup
    .append("text")
    .attr("x", width / 2)
    .attr("y", height + margin.bottom - 5)
    .attr("text-anchor", "middle")
    .text(`Glucose (${unit})`);

  chartGroup
    .append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "none")
    .attr("pointer-events", "all")
    .on("mouseover", () => tooltip.style("display", null))
    .on("mouseout", () => tooltip.style("display", "none"))
    .on("mousemove", (event) => {
      const [x, y] = d3.pointer(event);
      const xTime = xScale.invert(x);
      const minutesSinceMidnight = xTime.getHours() * 60 + xTime.getMinutes();
      const chunkIndex = Math.floor(minutesSinceMidnight / chunkSizeMinutes);
      const chunkData = percentileData[chunkIndex];

      if (chunkData) {
        tooltipText.text("").attr("y", 0);

        const mean = d3.mean(chunkData) || 0;
        addTooltipText(`95th Percentile: ${chunkData[4].toFixed(1)} ${unit}`);
        addTooltipText(`75th Percentile: ${chunkData[3].toFixed(1)} ${unit}`);
        addTooltipText(`50th Percentile: ${chunkData[2].toFixed(1)} ${unit}`);
        addTooltipText(`25th Percentile: ${chunkData[1].toFixed(1)} ${unit}`);
        addTooltipText(`5th Percentile: ${chunkData[0].toFixed(1)} ${unit}`);
        addTooltipText(`Mean: ${mean.toFixed(1)} ${unit}`);

        const tooltipWidth = tooltip.node()?.getBoundingClientRect().width || 0;
        const tooltipHeight =
          tooltip.node()?.getBoundingClientRect().height || 0;

        let tooltipX = x + 10;
        let tooltipY = y + 10;

        if (tooltipX + tooltipWidth > width) {
          tooltipX = x - tooltipWidth - 10;
        }

        if (tooltipY + tooltipHeight > height) {
          tooltipY = y - tooltipHeight - 10;
        }

        tooltip.attr("transform", `translate(${tooltipX}, ${tooltipY})`);

        tooltip
          .select("rect")
          .attr("width", tooltipWidth)
          .attr("height", tooltipHeight);
      }
    });
};

const AGPChart: React.FC<AGPChartProps> = ({
  data,
  percentiles,
  chunkSizeMinutes,
  chartWidth = 800,
  unit,
}) => {
  const chartRef = React.useRef<SVGSVGElement>(null);

  React.useEffect(() => {
    if (!chartRef.current) return;

    const svg = d3.select(chartRef.current);
    const width = chartWidth;
    const height = chartWidth / 3;
    const margin = { top: 20, right: 20, bottom: 40, left: 40 };
    const widthOfPlot = width - margin.left - margin.right;
    const heightOfPlot = height - margin.top - margin.bottom;

    svg.attr("width", width).attr("height", height);

    renderAGPChart(
      svg,
      data,
      widthOfPlot,
      heightOfPlot,
      margin,
      percentiles,
      chunkSizeMinutes,
      unit
    );
  }, [data, unit]);

  return <svg ref={chartRef} />;
};

function makeBreakpoints(toUnit: "mg/dL" | "mmol/L") {
  return {
    unit: toUnit,
    veryLow: convertGlucoseValue(54, "mg/dL", toUnit),
    low: convertGlucoseValue(70, "mg/dL", toUnit),
    high: convertGlucoseValue(180, "mg/dL", toUnit),
    veryHigh: convertGlucoseValue(250, "mg/dL", toUnit),
    // testing ranges for more variability in normal data
    // veryLow: convertGlucoseValue(100, "mg/dL", toUnit),
    // low: convertGlucoseValue(110, "mg/dL", toUnit),
    // high: convertGlucoseValue(120, "mg/dL", toUnit),
    // veryHigh: convertGlucoseValue(140, "mg/dL", toUnit),
  };
}
const GlucoseStatistics: React.FC<{
  data: CGMData[];
  unit: "mg/dL" | "mmol/L";
}> = ({ data, unit }) => {
  const { glucoseStatistics } = calculateAGPMetrics(
    data,
    makeBreakpoints(unit)
  );

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th
              style={{
                borderBottom: "2px solid #ddd",
                padding: "8px",
                textAlign: "left",
              }}
            >
              Calculated Metric
            </th>
            <th
              style={{
                borderBottom: "2px solid #ddd",
                padding: "8px",
                textAlign: "left",
              }}
            >
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: "8px" }}>Average Glucose (mean)</td>
            <td style={{ padding: "8px" }}>
              {glucoseStatistics.mean.toFixed(1)} {unit}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "8px" }}>
              Glucose Management Indicator (GMI)
            </td>
            <td style={{ padding: "8px" }}>
              {glucoseStatistics.gmi.toFixed(1)}%
            </td>
          </tr>
          <tr>
            <td style={{ padding: "8px" }}>Glucose Variability (CV)</td>
            <td style={{ padding: "8px" }}>
              {glucoseStatistics.cv.toFixed(1)}%
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const TimeInRangesVisualization: React.FC<{
  data: CGMData[];
  unit: "mg/dL" | "mmol/L";
}> = ({ data, unit }) => {
  const svgRef = useRef(null);
  const { timeInRanges } = calculateAGPMetrics(data, makeBreakpoints(unit));

  useEffect(() => {
    if (!data || data.length === 0) return;

    const margin = { top: 40, right: 150, bottom: 40, left: 40 };
    const width = 440 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;
    const barWidth = 100; // The width of the bar

    const svg = d3
      .select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom);

    svg.selectAll("*").remove(); // Clear svg content before redrawing

    const chart = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Define scales
    const yScale = d3
      .scaleLinear()
      .domain([0, 100]) // Assuming percentage scale
      .range([height, 0]);

    // Define the data for each band
    const bandsData = [
      {
        label: "Very Low",
        value: timeInRanges.veryLow.percentage,
        color: "rgba(139, 0, 0, 0.5)", // darkred, but lighter and more transparent
      },
      {
        label: "Low",
        value: timeInRanges.low.percentage,
        color: "rgba(255, 0, 0, 0.5)", // red, but lighter and more transparent
      },
      {
        label: "Target",
        value: timeInRanges.target.percentage,
        color: "rgba(0, 128, 0, 0.5)", // green, but lighter and more transparent
      },
      {
        label: "High",
        value: timeInRanges.high.percentage,
        color: "rgba(255, 255, 0, 0.5)", // yellow, but lighter and more transparent
      },
      {
        label: "Very High",
        value: timeInRanges.veryHigh.percentage,
        color: "rgba(255, 165, 0, 0.5)", // orange, but lighter and more transparent
      },
    ];

    // Calculate cumulative percentages for stacked layout
    let cumulativePercentage = 0;
    bandsData.forEach((band, index) => {
      band.startPercentage = cumulativePercentage;
      cumulativePercentage += band.value;
      band.endPercentage = cumulativePercentage;
      band.index = index; // Keep track of the index
    });

    // Draw bars
    chart
      .selectAll(".bar")
      .data(bandsData)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", width / 2 - barWidth / 2)
      .attr("y", (d) => yScale(d.endPercentage))
      .attr("width", barWidth)
      .attr(
        "height",
        (d) => yScale(d.startPercentage) - yScale(d.endPercentage)
      )
      .attr("fill", (d) => d.color);

    // Position labels based on the specified layout
    const labels = bandsData.map((d) => {
      let y;
      if (d.label === "Very High") {
        y = -20; // Above the chart
      } else if (d.label === "Very Low") {
        y = height + 20; // Below the chart
      } else {
        y = yScale(
          d.startPercentage + (d.endPercentage - d.startPercentage) / 2
        ); // Middle of the band
      }
      return {
        ...d,
        x: width / 2 + barWidth / 2 + 70,
        y: y,
      };
    });

    // Draw labels
    const labelContainers = chart
      .selectAll(".label-container")
      .data(labels)
      .enter()
      .append("g")
      .attr("class", "label-container")
      .attr("transform", (d) => `translate(${d.x + 0}, ${d.y})`);

    labelContainers
      .append("text")
      .attr("class", "label")
      .attr("dy", "0.35em")
      .attr("text-anchor", "start")
      .text((d) => d.label);

    labelContainers
      .append("text")
      .attr("class", "percentage")
      .attr("dy", "0.35em")
      .attr("x", 80)
      .attr("text-anchor", "start")
      .text((d) => `${d.value.toFixed(0)}%`);

    // Draw lines from bars to labels
    chart
      .selectAll(".label-line")
      .data(labels)
      .enter()
      .append("line")
      .attr("x1", width / 2 + barWidth / 2)
      .attr("y1", (d) =>
        yScale(d.startPercentage + (d.endPercentage - d.startPercentage) / 2)
      )
      .attr("x2", (d) => d.x - 10)
      .attr("y2", (d) => d.y)
      .attr("stroke", "black")
      .attr("stroke-width", 1);

    // Draw lines from bars to labels
    chart
      .selectAll(".label-line")
      .data(labels)
      .enter()
      .append("line")
      .attr("x1", width / 2 + barWidth / 2)
      .attr("y1", (d) =>
        yScale(d.startPercentage + (d.endPercentage - d.startPercentage) / 2)
      )
      .attr("x2", (d) => d.x - 10)
      .attr("y2", (d) => d.y)
      .attr("stroke", "black")
      .attr("stroke-width", 1);
  }, [data, unit]); // Rerender the component whenever data or unit changes

  return <svg ref={svgRef}></svg>;
};

const renderAGPDailyChart = (
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  data: CGMData[],
  width: number,
  height: number,
  margin: { top: number; right: number; bottom: number; left: number },
  date: string,
  unit: "mg/dL" | "mmol/L"
) => {
  const xScale = d3.scaleTime().range([0, width]);
  const yScale = d3.scaleLinear().range([height, 0]);

  const chartGroup = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const targetBreakpoints = makeBreakpoints(unit);
  const normalRange = [targetBreakpoints.low, targetBreakpoints.high];
  const dayStart = moment(date).startOf("day");
  const dayEnd = moment(date).startOf("day").add("1", "day");
  xScale.domain([dayStart, dayEnd]);
  yScale.domain([
    targetBreakpoints.veryLow * 0.9,
    targetBreakpoints.veryHigh * 1.1,
  ]);

  const lineGenerator = d3
    .line<CGMData>()
    .x((d) => xScale(d.timestamp))
    .y((d) => yScale(convertGlucoseValue(d.glucoseValue, d.unit, unit)))
    .curve(d3.curveMonotoneX);

  // Area for values below the normal range
  const areaBelowNormal = d3
    .area<CGMData>()
    .x((d) => xScale(d.timestamp))
    .y0((d) =>
      yScale(
        Math.min(
          normalRange[0],
          convertGlucoseValue(d.glucoseValue, d.unit, unit)
        )
      )
    )
    .y1((d) =>
      yScale(
        Math.min(
          normalRange[0],
          Math.max(
            normalRange[0],
            convertGlucoseValue(d.glucoseValue, d.unit, unit)
          )
        )
      )
    )
    .defined(
      (d) => convertGlucoseValue(d.glucoseValue, d.unit, unit) < normalRange[0]
    )
    .curve(d3.curveMonotoneX);

  // Area for values above the normal range
  const areaAboveNormal = d3
    .area<CGMData>()
    .x((d) => xScale(d.timestamp))
    .y0((d) => yScale(convertGlucoseValue(d.glucoseValue, d.unit, unit)))
    .y1((d) => yScale(normalRange[1]))
    .defined(
      (d) => convertGlucoseValue(d.glucoseValue, d.unit, unit) > normalRange[1]
    )
    .curve(d3.curveMonotoneX);

  // Append the line path
  chartGroup
    .append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "black")
    .attr("stroke-width", 1)
    .attr("d", lineGenerator);

  // Append grey box for normal range
  chartGroup
    .append("rect")
    .attr("x", 0)
    .attr("y", yScale(normalRange[1]))
    .attr("width", width)
    .attr("height", yScale(normalRange[0]) - yScale(normalRange[1]))
    .attr("fill", "#d3d3d366");

  // Append area for low values
  chartGroup
    .append("path")
    .datum(data)
    .attr("fill", "#ff000033")
    .attr("d", areaBelowNormal);

  // Append area for high values
  chartGroup
    .append("path")
    .datum(data)
    .attr("fill", "#00ff0033")
    .attr("d", areaAboveNormal);

  // Append the date in the top left corner
  chartGroup
    .append("text")
    .attr("x", margin.left)
    .attr("y", margin.top + 4)
    .attr("text-anchor", "start")
    .attr("class", "date-label")
    .text(moment(date).format("MM/DD")); // Format the date to show month/day

  chartGroup
    .append("text")
    .attr("x", xScale(moment(date).startOf("day").add(12, "hours").toDate()))
    .attr("y", height + margin.bottom - 5)
    .attr("text-anchor", "middle")
    .text("12p");
};

const AGPDailyChart: React.FC<{
  data: CGMData[];
  date: string;
  chartWidth?: number;
  continuous?: boolean;
  unit: "mg/dL" | "mmol/L";
}> = ({ data, date, chartWidth = 300, continuous = false, unit }) => {
  const chartRef = React.useRef(null);

  React.useEffect(() => {
    if (!chartRef.current) return;

    const svg = d3.select(chartRef.current);
    const width = chartWidth;
    const height = chartWidth / 2;
    const margin = continuous
      ? { top: 5, right: 0, bottom: 20, left: 0 }
      : { top: 5, right: 5, bottom: 20, left: 5 };
    const widthOfPlot = width - margin.left - margin.right;
    const heightOfPlot = height - margin.top - margin.bottom;

    svg.attr("width", width).attr("height", height);

    renderAGPDailyChart(
      svg,
      data,
      widthOfPlot,
      heightOfPlot,
      margin,
      date,
      unit
    );
  }, [data, date, continuous, unit]);

  return <svg ref={chartRef} />;
};

const WeeklyGlucoseProfileStrip: React.FC<{
  weeklyData: Map<string, CGMData[]>;
  unit: "mg/dL" | "mmol/L";
}> = ({ weeklyData, unit }) => {
  const singleDayWidth = 125;
  const days = Array.from(weeklyData.keys()).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );
  const stripWidth = days.length * singleDayWidth; // Width for one day's chart

  return (
    <div style={{ width: stripWidth, display: "flex" }}>
      {days.map((date) => {
        const dailyData = weeklyData.get(date);
        return (
          <AGPDailyChart
            key={date}
            data={dailyData}
            date={date}
            chartWidth={singleDayWidth}
            unit={unit}
          />
        );
      })}
    </div>
  );
};

const DailyGlucoseProfiles: React.FC<{
  data: CGMData[];
  unit: "mg/dL" | "mmol/L";
}> = ({ data, unit }) => {
  // Sort the data by timestamp to make sure we start from the first day present
  data.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Find the first day in the data to establish the week start
  const firstDay = moment(data[0].timestamp).startOf("day");

  // Group data by custom week, starting from the firstDay
  const weeklyData = new Map<string, Map<string, CGMData[]>>();
  data.forEach((d) => {
    const day = moment(d.timestamp);
    const weekStart = firstDay
      .clone()
      .add(Math.floor(day.diff(firstDay, "days") / 7) * 7, "days");
    const weekKey = weekStart.format("YYYY-MM-DD");
    const dayKey = day.format("YYYY-MM-DD");

    if (!weeklyData.has(weekKey)) {
      weeklyData.set(weekKey, new Map<string, CGMData[]>());
    }
    const weekData = weeklyData.get(weekKey);
    if (!weekData.has(dayKey)) {
      weekData.set(dayKey, []);
    }
    weekData.get(dayKey).push(d);
  });

  // Convert the map into an array of weeks, with each week containing a map of day data
  const weeksArray = Array.from(weeklyData, ([weekStart, weekData]) => [
    weekStart,
    weekData,
  ]);

  return (
    <div>
      <h2>Daily Glucose Profiles</h2>
      {weeksArray.map(([weekStart, weekData]) => (
        <WeeklyGlucoseProfileStrip
          key={weekStart}
          weeklyData={weekData}
          unit={unit}
        />
      ))}
    </div>
  );
};

const AGPReport: React.FC<{ data: CGMData[]; unit: "mg/dL" | "mmol/L" }> = ({
  data,
  unit = "mg/dL",
}) => {
  return (
    <div>
      <h1>Glucose Profile</h1>
      <AGPChart data={data} unit={unit} />
      <div style={{ display: "flex" }}>
        <GlucoseStatistics data={data} unit={unit} />
        <TimeInRangesVisualization data={data} unit={unit} />
      </div>
      <DailyGlucoseProfiles data={data} unit={unit} />
    </div>
  );
};

export default AGPReport;
