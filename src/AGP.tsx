import React from "react";
import { useRef, useEffect } from "react";
import * as d3 from "d3";
import _ from "lodash";
import type { AnalysisPeriod, CGMData } from "./agp-calc";
import { calculateAGPMetrics, convertGlucoseValue, makeBreakpoints } from "./agp-calc";
import moment from "moment-timezone";

const renderAGPChart = (
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  data: CGMData[],
  unit: "mg/dL" | "mmol/L",
  width: number,
  height: number,
  margin: { top: number; right: number; bottom: number; left: number },
  percentiles: number[] = [5, 25, 50, 75, 95],
  xAxisBucketSizeMinutes: number | undefined = 5, // X-axis bucket size of 1 minute
  windowSizeMinutes: number | undefined= 5, // Window size of 5 minutes
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

  const bucketCount = Math.ceil((24 * 60) / xAxisBucketSizeMinutes);
  const percentileData: number[][] = Array.from({ length: bucketCount }, () => []);

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex++) {
    const bucketStartMinutes = bucketIndex * xAxisBucketSizeMinutes;
    const bucketEndMinutes = bucketStartMinutes + xAxisBucketSizeMinutes;
    const windowStartMinutes = Math.max((bucketStartMinutes + bucketEndMinutes) / 2 - windowSizeMinutes / 2, 0);
    const windowEndMinutes = Math.min((bucketStartMinutes + bucketEndMinutes) / 2 + windowSizeMinutes / 2, 24 * 60);

    const bucketData = data.filter((d) => {
      const minutesSinceMidnight = d.timestamp.getHours() * 60 + d.timestamp.getMinutes();
      return minutesSinceMidnight >= windowStartMinutes && minutesSinceMidnight < windowEndMinutes;
    });

    const glucoseValues = bucketData.map((d) => convertGlucoseValue(d.glucoseValue, d.unit, unit));

    percentileData[bucketIndex] = percentiles.map((p) => d3.quantile(glucoseValues, p / 100) || 0);
  }

  console.log(percentileData)

  const lineGenerator = d3
    .line<[number, number]>()
    .x(([minutesSinceMidnight]) =>
      xScale(new Date(0, 0, 0, 0, minutesSinceMidnight))
    )
    .y(([, glucoseValue]) => yScale(glucoseValue))
    .curve(d3.curveBasis);

  const areaGenerator = d3
    .area<[number, number[]]>()
    .x(([minutesSinceMidnight]) =>
      xScale(new Date(0, 0, 0, 0, minutesSinceMidnight))
    )
    .y0(([_bucketIndex, d]) => yScale(d[0])) // 5th percentile for the upper area
    .y1(([_bucketIndex, d]) => yScale(d[4])) // 95th percentile for the upper area
    .curve(d3.curveBasis);

  // Create the upper shaded area (5th to 95th percentile)
  chartGroup
    .append("path")
    .datum(percentileData.map((d, bucketIndex) => [bucketIndex * xAxisBucketSizeMinutes, d]))
    .attr("fill", "#0F9D5822")
    .attr("d", areaGenerator as any);

  // Create the middle shaded area (25th to 75th percentile)
  areaGenerator
    .y0(([_bucketIndex, d]) => yScale(d[1])) // 25th percentile for the lower area
    .y1(([_bucketIndex, d]) => yScale(d[3])); // 75th percentile for the lower area

  chartGroup
    .append("path")
    .datum(percentileData.map((d, bucketIndex) => [bucketIndex * xAxisBucketSizeMinutes, d]))
    .attr("fill", "#0F9D5866")
    .attr("d", areaGenerator as any);

  percentiles.forEach((_p, i) => {
    const line = chartGroup
      .append("path")
      .attr("fill", "none")
      .attr("stroke", "black")
      .attr(
        "d",
        lineGenerator(
          percentileData.map((d, bucketIndex) => [
            bucketIndex * xAxisBucketSizeMinutes,
            d[i],
          ])
        )
      );

    if (i === 2) {
      line.attr("stroke-width", 1);
    } else {
      line.attr("stroke-width", 0);
    }
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
    .call(ctx => d3.axisBottom<Date>(xScale).ticks(12).tickFormat(d3.timeFormat("%H:%M"))(ctx));

  chartGroup.append("g").call(d3.axisLeft(yScale));

  chartGroup
    .append("text")
    .attr("x", width / 2)
    .attr("y", 0)
    .attr("text-anchor", "middle")
    .text(`Glucose Percentiles (${unit})`);

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
      const bucketIndex = Math.floor(minutesSinceMidnight / xAxisBucketSizeMinutes);
      const bucketData = percentileData[bucketIndex];

      if (bucketData) {
        tooltipText.text("").attr("y", 0);

        const mean = d3.mean(bucketData) || 0;
        addTooltipText(`Time: ${d3.timeFormat("%H:%M")(xTime)}`);
        addTooltipText(`95th Percentile: ${bucketData[4].toFixed(1)} ${unit}`);
        addTooltipText(`75th Percentile: ${bucketData[3].toFixed(1)} ${unit}`);
        addTooltipText(`50th Percentile: ${bucketData[2].toFixed(1)} ${unit}`);
        addTooltipText(`25th Percentile: ${bucketData[1].toFixed(1)} ${unit}`);
        addTooltipText(`5th Percentile: ${bucketData[0].toFixed(1)} ${unit}`);
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

interface AGPChartProps {
  data: CGMData[];
  unit: "mg/dL" | "mmol/L";
  percentiles?: number[];
  xAxisBucketSizeMinutes?: number;
  windowSizeMinutes?: number;
  chartWidth?: number;
}


const AGPChart: React.FC<AGPChartProps> = ({
  data,
  percentiles,
  chartWidth = 800,
  unit,
}) => {
  const chartRef = React.useRef<SVGSVGElement>(null);

  React.useEffect(() => {
    if (!chartRef.current) return;

    const svg = d3.select(chartRef.current);

      svg.selectAll("*").remove();

    const width = chartWidth;
    const height = chartWidth / 3;
    const margin = { top: 20, right: 20, bottom: 40, left: 40 };
    const widthOfPlot = width - margin.left - margin.right;
    const heightOfPlot = height - margin.top - margin.bottom;

    svg.attr("width", width).attr("height", height);

    renderAGPChart(
      svg,
      data,
      unit,
      widthOfPlot,
      heightOfPlot,
      margin,
      percentiles,
    );
  }, [data, unit]);

  return <svg ref={chartRef} />;
};


const GlucoseStatistics: React.FC<{
  data: CGMData[];
  unit: "mg/dL" | "mmol/L";
  analysisPeriod: AnalysisPeriod;
}> = ({ data, unit, analysisPeriod }) => {

  const { glucoseStatistics, sensorActivePercentage, totalDays } = calculateAGPMetrics(
    data,
    analysisPeriod,
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
            <td style={{ padding: "8px" }}>Days Worn</td>
            <td style={{ padding: "8px" }}>
              {totalDays} days
            </td>
          </tr>
          <tr>
            <td style={{ padding: "8px" }}>Sensor Active Time</td>
            <td style={{ padding: "8px" }}>
              {sensorActivePercentage.toFixed(0)}%
            </td>
          </tr>
  
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
  analysisPeriod: AnalysisPeriod;
}> = ({ data, unit, analysisPeriod }) => {
  const svgRef = useRef(null);
  const { timeInRanges } = calculateAGPMetrics(data, analysisPeriod, makeBreakpoints(unit));

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
        index: 0,
        label: "Very Low",
        value: timeInRanges.veryLow,
        color: "rgba(139, 0, 0, 0.5)", // darkred, but lighter and more transparent
        startPercentage: 0,
        endPercentage: 0,
      },
      {
        index: 1,
        label: "Low",
        value: timeInRanges.low,
        color: "rgba(255, 0, 0, 0.5)", // red, but lighter and more transparent
        startPercentage: 0,
        endPercentage: 0,
      },
      {
        index: 2,
        label: "Target",
        value: timeInRanges.target,
        color: "rgba(0, 128, 0, 0.5)", // green, but lighter and more transparent
        startPercentage: 0,
        endPercentage: 0,
      },
      {
        index: 3,
        label: "High",
        value: timeInRanges.high,
        color: "rgba(255, 255, 0, 0.5)", // yellow, but lighter and more transparent
        startPercentage: 0,
        endPercentage: 0,
      },
      {
        index: 4,
        label: "Very High",
        value: timeInRanges.veryHigh,
        color: "rgba(255, 165, 0, 0.5)", // orange, but lighter and more transparent
        startPercentage: 0,
        endPercentage: 0,
      },
    ];

    // Calculate cumulative percentages for stacked layout
    let cumulativePercentage = 0;
    bandsData.forEach((band) => {
      band.startPercentage = cumulativePercentage;
      cumulativePercentage += band.value;
      band.endPercentage = cumulativePercentage;
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
    .y0((_d) => yScale(normalRange[1]))
    .y1((d) => yScale(convertGlucoseValue(d.glucoseValue, d.unit, unit)))
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
  const chartRef = React.useRef<SVGSVGElement>(null);

  React.useEffect(() => {
    if (!chartRef.current) return;

    const svg = d3.select(chartRef.current);

    // clear SVG contents entirely
    svg.selectAll("*").remove();
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
  const singleDayWidth = 111;
  const days = Array.from(weeklyData.keys()).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );
  const stripWidth = days.length * singleDayWidth; // Width for one day's chart

  return (
    <div style={{ width: stripWidth, display: "flex", gap: "2px" }}>
      {days.map((date) => {
        const dailyData = weeklyData.get(date)!;
        return (
          <AGPDailyChart
            key={date}
            data={dailyData}
            date={date}
            chartWidth={singleDayWidth}
            continuous={true}
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
      // Initialize the week with empty arrays for each day
      const emptyWeek = new Map<string, CGMData[]>();
      for (let i = 0; i < 7; i++) {
        const emptyDay = weekStart.clone().add(i, "days").format("YYYY-MM-DD");
        emptyWeek.set(emptyDay, []);
      }
      weeklyData.set(weekKey, emptyWeek);
    }

    const weekData = weeklyData.get(weekKey)!;
    weekData.get(dayKey)!.push(d);
  });

  const weeksArray: [string, Map<string, CGMData[]>][] = Array.from(
    weeklyData,
    ([weekStart, weekData]) => [weekStart, weekData]
  );

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

const AGPReport: React.FC<{ data: CGMData[]; unit?: "mg/dL" | "mmol/L", analysisPeriod: AnalysisPeriod }> = ({
  data,
  analysisPeriod,
  unit = "mg/dL",
}) => {
  const [startDate, setStartDate] = React.useState<string>(analysisPeriod.start);
  const [endDate, setEndDate] = React.useState<string>(analysisPeriod.end);
  const [selectedUnit, _setSelectedUnit] = React.useState<"mg/dL" | "mmol/L">(unit);

  const dataInAnalysisPeriod = data.filter(t => moment(t.timestamp).isBetween(startDate, endDate, 'day', '[]'));
  console.log("in AP", dataInAnalysisPeriod.length);
  return (
    <div className="agp">
      <div style={{}}>
      <h1 style={{display: "flex", alignItems: "center", whiteSpace: "nowrap"}}>Glucose Profile from
      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /> through
      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </h1>
      </div>
      {dataInAnalysisPeriod?.length && <>
      <AGPChart data={dataInAnalysisPeriod} unit={selectedUnit} />
      <div style={{ display: "flex" }}>
        <GlucoseStatistics analysisPeriod={{start: startDate, end: endDate}} data={dataInAnalysisPeriod} unit={selectedUnit} />
        <TimeInRangesVisualization analysisPeriod={{start: startDate, end: endDate}} data={dataInAnalysisPeriod} unit={selectedUnit} />
      </div>
      <DailyGlucoseProfiles data={dataInAnalysisPeriod} unit={selectedUnit} />
      </> ||  "No data in the selected period"}
    </div>
  );
};

export default AGPReport;
