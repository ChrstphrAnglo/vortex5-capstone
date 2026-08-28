import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class HelpPage extends StatelessWidget {
  const HelpPage({super.key});

  // Same AQI category colors/breakpoints used in home_page.dart — kept in
  // sync intentionally rather than shared, to avoid touching that file's
  // internals for a reference page.
  static const _cGood = Color(0xFF0A9A40);
  static const _cModerate = Color(0xFFF59E0B);
  static const _cUsg = Color(0xFFEA580C);
  static const _cUnhealthy = Color(0xFFDC2626);
  static const _cVeryUnhealthy = Color(0xFF9333EA);
  static const _cHazardous = Color(0xFF7F1D1D);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: const Color(0xFF0F172A),
        title: Text('Help & Support',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 20)),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
        children: [
          _sectionTitle('Understanding AQI'),
          const SizedBox(height: 4),
          Text(
            'The overall Air Quality Index (AQI) shown on Home is grouped '
            'into six bands:',
            style: GoogleFonts.inter(color: const Color(0xFF64748B), fontSize: 13),
          ),
          const SizedBox(height: 12),
          _aqiLegendRow(_cGood, 'Good', '0–50'),
          _aqiLegendRow(_cModerate, 'Moderate', '51–100'),
          _aqiLegendRow(_cUsg, 'Unhealthy for Sensitive Groups', '101–150'),
          _aqiLegendRow(_cUnhealthy, 'Unhealthy', '151–200'),
          _aqiLegendRow(_cVeryUnhealthy, 'Very Unhealthy', '201–300'),
          _aqiLegendRow(_cHazardous, 'Hazardous', '300+'),

          const SizedBox(height: 28),
          _sectionTitle('Sensor Readings Explained'),
          const SizedBox(height: 12),
          _readingRow('PM2.5 (µg/m³)',
              'Good ≤12 · Moderate ≤35.4 · Unhealthy (SG) ≤55.4 · Unhealthy ≤150.4 · Very Unhealthy >150.4'),
          _readingRow('PM10 (µg/m³)',
              'Good ≤54 · Moderate ≤154 · Unhealthy (SG) ≤254 · Unhealthy ≤354 · Very Unhealthy >354'),
          _readingRow('CO₂ (ppm)',
              'Good ≤800 · Moderate ≤1000 · Stuffy ≤1500 · Poor ≤2000 · Very Poor >2000'),
          _readingRow('TVOC (µg/m³)',
              'Good ≤300 · Moderate ≤500 · Elevated ≤1000 · High ≤3000 · Very High >3000'),
          _readingRow('Temperature (°C)',
              'Comfortable 20–26 · Cool 17–20 · Warm 26–30 · Cold <17 · Hot >30'),
          _readingRow('Humidity (%)',
              'Comfortable 30–60 · Dry 20–30 · Humid 60–70 · Too Dry <20 · Too Humid >70'),

          const SizedBox(height: 28),
          _sectionTitle('Connecting a New Sensor'),
          const SizedBox(height: 4),
          Text(
            'Go to the Connect tab and follow the setup steps to add a new '
            'BewAir sensor to your account. Connecting a new sensor is '
            'restricted to admin accounts.',
            style: GoogleFonts.inter(color: const Color(0xFF334155), fontSize: 14, height: 1.5),
          ),

          const SizedBox(height: 28),
          _sectionTitle('Need more help?'),
          const SizedBox(height: 4),
          Text(
            'Contact your school administrator for further assistance.',
            style: GoogleFonts.inter(color: const Color(0xFF334155), fontSize: 14, height: 1.5),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String text) => Text(
        text,
        style: GoogleFonts.poppins(
          fontSize: 16,
          fontWeight: FontWeight.w700,
          color: const Color(0xFF0F172A),
        ),
      );

  Widget _aqiLegendRow(Color color, String label, String range) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(label,
                style: GoogleFonts.inter(
                    fontSize: 14, fontWeight: FontWeight.w600, color: const Color(0xFF0F172A))),
          ),
          Text(range,
              style: GoogleFonts.inter(fontSize: 13, color: const Color(0xFF64748B))),
        ],
      ),
    );
  }

  Widget _readingRow(String label, String breakdown) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: GoogleFonts.inter(
                  fontSize: 14, fontWeight: FontWeight.w600, color: const Color(0xFF0F172A))),
          const SizedBox(height: 2),
          Text(breakdown,
              style: GoogleFonts.inter(fontSize: 12.5, color: const Color(0xFF64748B), height: 1.4)),
        ],
      ),
    );
  }
}
