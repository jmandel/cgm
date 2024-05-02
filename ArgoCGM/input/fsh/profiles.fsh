Alias: $UCUM = http://unitsofmeasure.org
Alias: $LNC = http://loinc.org
Alias: $TEMP_CS = https://tx.argo.run/cgm-summary

ValueSet: GlucoseUnits
Id: glucose-units
Title: "Glucose Measurement Units"
* $UCUM#mg/dL "mg/dL"
* $UCUM#mmol/L "mmol/L"

RuleSet: CommonObservationElements
* status MS
* category 1..1 MS
  * coding = ObservationCategoryCodes#laboratory
* subject 1..1 MS
* value[x] only Quantity


RuleSet: GlucoseMass
* value[x] only Quantity
* valueQuantity
  * code = #mg/dL
  * unit = "mg/dl"

RuleSet: GlucoseMolar
* value[x] only Quantity
* valueQuantity
  * code = #mmol/L
  * unit = "mmol/l"

Profile: CGMSensorReadingMass
Parent: Observation
Id: cgm-sensor-reading-mass
* insert CommonObservationElements
* insert GlucoseMass
* code = $LNC#99504-3
* effectiveDateTime 1..1 MS

Profile: CGMSensorReadingMolar
Parent: Observation
Id: cgm-sensor-reading-molar
* insert CommonObservationElements
* insert GlucoseMolar
* code = $LNC#14745-4
* effectiveDateTime 1..1 MS

Profile: CGMSummaryBase
Parent: Observation
Id: cgm-summary-base
Title: "CGM Summary Base"
* insert CommonObservationElements
* code from CGMSummary (required)
* effectivePeriod 1..1 MS
  * ^short = "Reporting period for the CGM summary."
  * start 1..1 MS
    * ^short = "YYYY-MM-DD representation"
  * end 1..1 MS
    * ^short = "YYYY-MM-DD representation"

Profile: CGMSummary
Parent: Observation
Id: cgm-summary
* insert CommonObservationElements
* effectivePeriod 1..1 MS
  * ^short = "YYYY-MM-DD representation"
  * start 1..1 MS
  * end 1..1 MS
* valueQuantity 1..1 MS
  * unit from GlucoseUnits (required)
  * system = $UCUM (exactly)
* hasMember ^slicing.discriminator.type = #profile
* hasMember ^slicing.discriminator.path = "resolve()"
* hasMember ^slicing.rules = #open
* hasMember contains
    meanGlucoseMass 0..1 MS and
    meanGlucoseMolar 0..1 MS and
    timeInVeryLow 1..1 MS and
    timeInLow 1..1 MS and
    timeInTarget 1..1 MS and
    timeInHigh 1..1 MS and
    timeInVeryHigh 1..1 MS and
    gmi 1..1 MS and
    cv 1..1 MS and
    daysOfWear 1..1 MS and
    sensorActivePercentage 1..1 MS
* hasMember[meanGlucoseMass] only Reference(CGMSummaryMeanGlucoseMass)
* hasMember[meanGlucoseMolar] only Reference(CGMSummaryMeanGlucoseMolar)
* hasMember[timeInVeryLow] only Reference(CGMSummaryTimeInVeryLow)
* hasMember[timeInLow] only Reference(CGMSummaryTimeInLow)
* hasMember[timeInTarget] only Reference(CGMSummaryTimeInTarget)
* hasMember[timeInHigh] only Reference(CGMSummaryTimeInHigh)
* hasMember[timeInVeryHigh] only Reference(CGMSummaryTimeInVeryHigh)
* hasMember[gmi] only Reference(CGMSummaryGMI)
* hasMember[cv] only Reference(CGMSummaryCoefficientOfVariation)
* hasMember[daysOfWear] only Reference(CGMSummaryDaysOfWear)
* hasMember[sensorActivePercentage] only Reference(CGMSummarySensorActivePercentage)


Profile: CGMSummaryMeanGlucoseMass
Parent: CGMSummaryBase
Id: cgm-summary-mean-glucose-mass
Title: "Mean Glucose"
* code = CGMSummary#mean-glucose
* insert GlucoseMass

Profile: CGMSummaryMeanGlucoseMolar
Parent: CGMSummaryBase
Id: cgm-summary-mean-glucose-molar
Title: "Mean Glucose"
* code = CGMSummary#mean-glucose
* insert GlucoseMolar

RuleSet: QuantityPercent
* value[x] only Quantity
* valueQuantity 1..1
  * unit = "%" (exactly)
  * code = #d (exactly)
  * system = $UCUM (exactly)

Profile: CGMSummaryTimeInVeryLow
Parent: CGMSummaryBase
Id: cgm-summary-time-in-very-low
Title: "Time in Very Low Range"
* code = CGMSummary#time-in-very-low
* insert QuantityPercent

Profile: CGMSummaryTimeInLow
Parent: CGMSummaryBase
Id: cgm-summary-time-in-low
Title: "Time in Low Range"
* code = CGMSummary#time-in-low
* insert QuantityPercent

Profile: CGMSummaryTimeInTarget
Parent: CGMSummaryBase
Id: cgm-summary-time-in-target
Title: "Time in Target Range"
* code = CGMSummary#time-in-target
* insert QuantityPercent

Profile: CGMSummaryTimeInHigh
Parent: CGMSummaryBase
Id: cgm-summary-time-in-high
Title: "Time in High Range"
* code = CGMSummary#time-in-high
* insert QuantityPercent

Profile: CGMSummaryTimeInVeryHigh
Parent: CGMSummaryBase
Id: cgm-summary-time-in-very-high
Title: "Time in Very High Range"
* code = CGMSummary#time-in-very-high
* insert QuantityPercent

Profile: CGMSummaryGMI
Parent: CGMSummaryBase
Id: cgm-summary-gmi
Title: "Glucose Management Indicator (GMI)"
* code = CGMSummary#gmi
* insert QuantityPercent

Profile: CGMSummaryCoefficientOfVariation
Parent: CGMSummaryBase
Id: cgm-summary-coefficient-of-variation
Title: "Coefficient of Variation (CV)"
* code = CGMSummary#cv
* insert QuantityPercent

Profile: CGMSummaryDaysOfWear
Parent: CGMSummaryBase
Id: cgm-summary-days-of-wear
Title: "Days of Wear"
* code = CGMSummary#days-of-wear
* valueQuantity 1..1 MS
  * unit = "days" (exactly)
  * code = #d
  * system = $UCUM (exactly)

Profile: CGMSummarySensorActivePercentage
Parent: CGMSummaryBase
Id: cgm-summary-sensor-active-percentage
Title: "Sensor Active Percentage"
* code = CGMSummary#sensor-active-percentage
* insert QuantityPercent

Profile: CGMDevice
Parent: Device
Id: cgm-device
* deviceName ^slicing.rules = #open
* deviceName contains
    cgmDeviceName 1..* MS
* deviceName[cgmDeviceName].name 1..1 MS
* deviceName[cgmDeviceName].type = #user-friendly-name
* serialNumber 1..1 MS
* identifier 1..* MS

CodeSystem: CGMSummary
Id: cgm-summary
Title: "CGM Summary Code System"
* ^url = $TEMP_CS
* ^experimental = false
* #cgm-summary "CGM Summary"
* #mean-glucose "Mean Glucose"
* #time-in-very-low "Time in Very Low Range"
* #time-in-low "Time in Low Range"
* #time-in-target "Time in Target Range"
* #time-in-high "Time in High Range"
* #time-in-very-high "Time in Very High Range"
* #gmi "Glucose Management Indicator (GMI)"
* #cv "Coefficient of Variation (CV)"
* #days-of-wear "Days of Wear"
* #sensor-active-percentage "Sensor Active Percentage"

ValueSet: CGMSummary
Id: cgm-summary
* include codes from system CGMSummary

Instance: CGMSummaryToLoinc
InstanceOf: ConceptMap
Usage: #definition
* status = #draft
* group[+].source = $TEMP_CS
* group[=].target = $LNC
* group[=].element[+].code = #mean-glucose
* group[=].element[=].target[+].code = #97507-8
* group[=].element[=].target[=].equivalence = #equivalent

* group[=].element[+].code = #time-in-target
* group[=].element[=].target[+].code = #97510-2
* group[=].element[=].target[=].equivalence = #equivalent

* group[=].element[+].code = #gmi
* group[=].element[=].target[+].code = #97506-0
* group[=].element[=].target[=].equivalence = #equivalent
