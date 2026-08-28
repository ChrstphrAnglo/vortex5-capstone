import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Small colored pill showing a user's role. Reuses the two colors from the
/// app's original blue→purple identity gradient as meaningful role
/// color-coding: admin = purple, staff = the standard brand blue.
class RoleBadge extends StatelessWidget {
  final String role;

  const RoleBadge({super.key, required this.role});

  static const _adminColor = Color(0xFF7C3AED);
  static const _staffColor = Color(0xFF1E5BFF);

  Color get _color => role == 'admin' ? _adminColor : _staffColor;

  @override
  Widget build(BuildContext context) {
    if (role.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: _color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        role[0].toUpperCase() + role.substring(1),
        style: GoogleFonts.inter(
          color: _color,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
