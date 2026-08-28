import 'package:flutter/material.dart';
import 'package:vortex5_application_2/models/sensor_device.dart';

/// Shared "Reset Device?" confirmation — previously duplicated identically
/// in home_page.dart and device_list_page.dart. Handles the offline
/// pre-check and the confirmation dialog only; each caller keeps its own
/// post-confirmation busy-state/snackbar handling, which differs slightly
/// per page.
Future<bool> confirmResetDevice(BuildContext context, SensorDevice device) async {
  if (device.status == SensorStatus.offline) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Device must be online to receive a reset command. '
          'Use the BOOT button on the ESP32 instead.',
        ),
      ),
    );
    return false;
  }

  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Reset Device?'),
      content: Text(
        'This will wipe the Wi-Fi credentials on ${device.name} and put it back '
        'into provisioning mode. It will need to be re-provisioned.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Reset', style: TextStyle(color: Colors.orange)),
        ),
      ],
    ),
  );

  return confirmed == true;
}
