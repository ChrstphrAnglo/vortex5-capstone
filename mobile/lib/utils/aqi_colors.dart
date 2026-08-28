import 'package:flutter/material.dart';

/// Single source of truth for the AQI band → color mapping. Previously
/// duplicated three times (home_page.dart's constants, home_page.dart's
/// gauge painter, and help_page.dart's legend) with a real risk of drifting
/// out of sync if one copy ever got tuned without the others.
const aqiGood = Color(0xFF0A9A40);
const aqiModerate = Color(0xFFF59E0B);
const aqiUsg = Color(0xFFEA580C);
const aqiUnhealthy = Color(0xFFDC2626);
const aqiVeryUnhealthy = Color(0xFF9333EA);
const aqiHazardous = Color(0xFF7F1D1D);

const aqiBandColors = [
  aqiGood,
  aqiModerate,
  aqiUsg,
  aqiUnhealthy,
  aqiVeryUnhealthy,
  aqiHazardous,
];

Color aqiColorFor(int aqi) {
  if (aqi <= 50) return aqiGood;
  if (aqi <= 100) return aqiModerate;
  if (aqi <= 150) return aqiUsg;
  if (aqi <= 200) return aqiUnhealthy;
  if (aqi <= 300) return aqiVeryUnhealthy;
  return aqiHazardous;
}
