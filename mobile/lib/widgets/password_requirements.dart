import 'package:flutter/material.dart';

/// Live checklist of password strength requirements, matching the rules in
/// UserSession.validateStrongPassword. Meant to be shown under a password
/// field and rebuilt as the user types (e.g. via a TextEditingController
/// listener calling setState).
class PasswordRequirements extends StatelessWidget {
  final String password;

  const PasswordRequirements({super.key, required this.password});

  @override
  Widget build(BuildContext context) {
    final checks = <String, bool>{
      'At least 8 characters': password.length >= 8,
      'An uppercase letter': RegExp(r'[A-Z]').hasMatch(password),
      'A lowercase letter': RegExp(r'[a-z]').hasMatch(password),
      'A number': RegExp(r'\d').hasMatch(password),
      'A symbol': RegExp(r'[!@#$%^&*(),.?":{}|<>_\-+=/\\\[\]~`]')
          .hasMatch(password),
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: checks.entries.map((entry) {
        final met = entry.value;
        return Padding(
          padding: const EdgeInsets.only(bottom: 3),
          child: Row(
            children: [
              Icon(
                met ? Icons.check_circle : Icons.circle_outlined,
                size: 15,
                color: met ? const Color(0xFF16A34A) : const Color(0xFF94A3B8),
              ),
              const SizedBox(width: 6),
              Text(
                entry.key,
                style: TextStyle(
                  fontSize: 12,
                  color: met ? const Color(0xFF16A34A) : const Color(0xFF64748B),
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}
