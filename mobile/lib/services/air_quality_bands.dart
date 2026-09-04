import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;

/// The canonical air-quality band table, fetched from the backend.
///
/// The app used to carry its own numbers — a hardcoded 100/40/1000 alert set in
/// [AppState] plus separate cut-points inside the home and help pages — which
/// disagreed with the web dashboard and with the backend alerting. All of it now
/// comes from GET /api/air-quality/bands, the same table the alert engine reads.
///
/// [load] fills the bundled asset copy in first so the UI always has a real
/// table, then overwrites it from the network. The asset is GENERATED from the
/// backend config (`node scripts/generateClientBands.js` in web/backend), so it
/// cannot quietly drift the way a hand-typed copy would.
class AirQualityBands {
  AirQualityBands({
    required this.categories,
    required this.fields,
    required this.limits,
    required this.source,
    required this.origin,
  });

  final List<AqiCategory> categories;
  final Map<String, AirQualityField> fields;

  /// Alert limits in force: an active admin override merged over the standards.
  /// Two-sided fields appear as `TemperatureMin` / `TemperatureMax`.
  final Map<String, double> limits;

  final String source;

  /// Where this table came from — useful when diagnosing a stale app.
  final String origin; // 'network' | 'asset'

  static const _assetPath = 'assets/air_quality_bands.json';

  static AirQualityBands? _current;

  /// The table in force, or null before [load] completes. Callers must handle
  /// null rather than falling back to invented numbers.
  static AirQualityBands? get current => _current;

  /// Loads the bundled table, then tries the network. Never throws.
  static Future<AirQualityBands?> load(String baseUrl) async {
    // 1. Bundled copy — always available, correct as of the last app build.
    try {
      final raw = await rootBundle.loadString(_assetPath);
      _current = AirQualityBands.fromJson(
          jsonDecode(raw) as Map<String, dynamic>, 'asset');
    } catch (e) {
      debugPrint('[bands] bundled table unavailable: $e');
    }

    // 2. Live copy — picks up any admin override of the standard limits.
    await refresh(baseUrl);
    return _current;
  }

  /// Re-fetches from the server, keeping whatever is loaded if the call fails.
  static Future<bool> refresh(String baseUrl) async {
    try {
      final uri = Uri.parse('$baseUrl/api/air-quality/bands');
      // No Authorization header: the endpoint is public by design, so the
      // splash and login screens can grade a reading before anyone signs in.
      final res =
          await http.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return false;
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      _current = AirQualityBands.fromJson(json, 'network');
      return true;
    } catch (e) {
      debugPrint('[bands] using bundled table: $e');
      return false;
    }
  }

  factory AirQualityBands.fromJson(Map<String, dynamic> json, String origin) {
    final fields = <String, AirQualityField>{};
    for (final raw in (json['fields'] as List<dynamic>? ?? const [])) {
      final f = AirQualityField.fromJson(raw as Map<String, dynamic>);
      fields[f.key] = f;
    }

    final limits = <String, double>{};
    (json['limits'] as Map<String, dynamic>? ?? const {}).forEach((k, v) {
      if (v is num) limits[k] = v.toDouble();
    });

    return AirQualityBands(
      categories: (json['categories'] as List<dynamic>? ?? const [])
          .map((c) => AqiCategory.fromJson(c as Map<String, dynamic>))
          .toList(),
      fields: fields,
      limits: limits,
      source: json['source']?.toString() ?? '',
      origin: origin,
    );
  }

  /// The DENR category an AQI index falls in.
  AqiCategory? categoryFor(int aqi) {
    for (final c in categories) {
      if (c.max == null || aqi <= c.max!) return c;
    }
    return categories.isEmpty ? null : categories.last;
  }

  /// Grade one sensor value. [field] is a sensor field name (PM25, CO2, ...).
  AirQualityBand? bandFor(String field, double value) {
    final def = fields[field];
    if (def == null || def.bands.isEmpty) return null;
    for (final b in def.bands) {
      if (b.max == null || value <= b.max!) return b;
    }
    return def.bands.last;
  }

  /// True when the value sits inside the acceptable range for [field].
  bool isAcceptable(String field, double value) {
    final def = fields[field];
    if (def == null) return true;
    if (def.twoSided) {
      if (def.alertLow != null && value < def.alertLow!) return false;
      if (def.alertHigh != null && value > def.alertHigh!) return false;
      return true;
    }
    return def.alertHigh == null || value <= def.alertHigh!;
  }

  /// Convenience for the one-sided alert limits the app exposes as settings.
  double? limit(String key) => limits[key];
}

class AqiCategory {
  const AqiCategory({
    required this.name,
    required this.min,
    required this.max,
    required this.color,
    required this.actions,
  });

  final String name;
  final int min;
  final int? max;
  final Color color;
  final List<String> actions;

  factory AqiCategory.fromJson(Map<String, dynamic> json) => AqiCategory(
        name: json['name']?.toString() ?? '',
        min: (json['min'] as num?)?.toInt() ?? 0,
        max: (json['max'] as num?)?.toInt(),
        color: parseHexColor(json['color']?.toString()),
        actions: (json['actions'] as List<dynamic>? ?? const [])
            .map((a) => a.toString())
            .toList(),
      );

  /// Inclusive display range, e.g. "51–100" or "301+".
  String get range => max == null ? '$min+' : '$min–$max';
}

class AirQualityField {
  const AirQualityField({
    required this.key,
    required this.label,
    required this.unit,
    required this.alerting,
    required this.twoSided,
    required this.derived,
    required this.note,
    required this.alertLow,
    required this.alertHigh,
    required this.bands,
  });

  final String key;
  final String label;
  final String unit;
  final bool alerting;
  final bool twoSided;

  /// CO2 and formaldehyde are simulated by the FS00905B from its VOC element
  /// rather than measured. Any screen showing them must say so.
  final bool derived;

  final String note;
  final double? alertLow;
  final double? alertHigh;
  final List<AirQualityBand> bands;

  factory AirQualityField.fromJson(Map<String, dynamic> json) =>
      AirQualityField(
        key: json['key']?.toString() ?? '',
        label: json['label']?.toString() ?? '',
        unit: json['unit']?.toString() ?? '',
        alerting: json['alerting'] as bool? ?? false,
        twoSided: json['twoSided'] as bool? ?? false,
        derived: json['derived'] as bool? ?? false,
        note: json['note']?.toString() ?? '',
        alertLow: (json['alertLow'] as num?)?.toDouble(),
        alertHigh: (json['alertHigh'] as num?)?.toDouble(),
        bands: (json['bands'] as List<dynamic>? ?? const [])
            .map((b) => AirQualityBand.fromJson(b as Map<String, dynamic>))
            .toList(),
      );

  /// Compact "Good ≤25 · Fair ≤35 · … · Emergency >90" summary for the help
  /// screen. An open-ended top band is described by the edge below it, so the
  /// reader sees a number rather than a blank.
  String get summary {
    final parts = <String>[];
    for (var i = 0; i < bands.length; i++) {
      final b = bands[i];
      if (b.max != null) {
        parts.add('${b.level} ≤${_trim(b.max!)}');
      } else if (b.min != null) {
        parts.add('${b.level} >${_trim(b.min!)}');
      } else {
        parts.add(b.level);
      }
    }
    return parts.join(' · ');
  }
}

class AirQualityBand {
  const AirQualityBand({
    required this.min,
    required this.max,
    required this.level,
    required this.color,
    required this.advice,
  });

  /// null means open-ended on that side (JSON has no infinity).
  final double? min;
  final double? max;
  final String level;
  final Color color;
  final String advice;

  factory AirQualityBand.fromJson(Map<String, dynamic> json) => AirQualityBand(
        min: (json['min'] as num?)?.toDouble(),
        max: (json['max'] as num?)?.toDouble(),
        level: json['level']?.toString() ?? '',
        color: parseHexColor(json['color']?.toString()),
        advice: json['advice']?.toString() ?? '',
      );
}

String _trim(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

/// "#16A34A" -> Color(0xFF16A34A). Falls back to slate grey on anything odd,
/// so a malformed colour degrades the tint rather than crashing a screen.
Color parseHexColor(String? hex) {
  if (hex == null) return const Color(0xFF94A3B8);
  final cleaned = hex.replaceAll('#', '').trim();
  if (cleaned.length != 6 && cleaned.length != 8) return const Color(0xFF94A3B8);
  final value = int.tryParse(cleaned.length == 6 ? 'FF$cleaned' : cleaned, radix: 16);
  return value == null ? const Color(0xFF94A3B8) : Color(value);
}
