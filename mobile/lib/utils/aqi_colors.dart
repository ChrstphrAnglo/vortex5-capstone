import 'package:flutter/material.dart';

import '../services/air_quality_bands.dart';

/// Offline palette for the DENR AQI bands.
///
/// The band BOUNDARIES and names live in the canonical table the backend serves
/// (see [AirQualityBands]); these constants exist so the gauge still has colours
/// before that table loads, and so a widget can name one band directly. When the
/// table is loaded, [aqiColorFor] prefers its colours — that is the single
/// source of truth, and these are the understudy.
///
/// Previously duplicated three times (home_page constants, the gauge painter,
/// and the help_page legend) with a real risk of drifting out of sync.
const aqiGood = Color(0xFF0A9A40);
const aqiFair = Color(0xFFF59E0B);
const aqiUsg = Color(0xFFEA580C);
const aqiVeryUnhealthy = Color(0xFFDC2626);
const aqiAcutelyUnhealthy = Color(0xFF9333EA);
const aqiEmergency = Color(0xFF7F1D1D);

const aqiBandColors = [
  aqiGood,
  aqiFair,
  aqiUsg,
  aqiVeryUnhealthy,
  aqiAcutelyUnhealthy,
  aqiEmergency,
];

/// Colours for the six bands, from the served table when it is loaded.
List<Color> aqiBandColorsNow() {
  final bands = AirQualityBands.current;
  if (bands == null || bands.categories.length != aqiBandColors.length) {
    return aqiBandColors;
  }
  return bands.categories.map((c) => c.color).toList();
}

/// Band colour for an AQI index. Uses the served boundaries when available so
/// the app cannot colour by one scale while the backend alerts on another.
Color aqiColorFor(int aqi) {
  final category = AirQualityBands.current?.categoryFor(aqi);
  if (category != null) return category.color;

  // Fallback boundaries, matching the DENR table in
  // web/backend/config/airQualityBands.js.
  if (aqi <= 50) return aqiGood;
  if (aqi <= 100) return aqiFair;
  if (aqi <= 150) return aqiUsg;
  if (aqi <= 200) return aqiVeryUnhealthy;
  if (aqi <= 300) return aqiAcutelyUnhealthy;
  return aqiEmergency;
}

/// DENR category name for an AQI index, or null before the table loads.
String? aqiCategoryName(int aqi) => AirQualityBands.current?.categoryFor(aqi)?.name;
