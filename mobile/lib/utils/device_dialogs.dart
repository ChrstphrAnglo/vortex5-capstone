import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:vortex5_application_2/models/sensor_device.dart';
import 'package:vortex5_application_2/models/user_session.dart';

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

/// "Edit Device" dialog — lets an admin rename a device or move it to a
/// different room. Returns {'name': ..., 'room': ...} if saved, or null if
/// cancelled. The actual PATCH call is left to the caller (AppState.updateDevice),
/// same separation of concerns as confirmResetDevice above.
Future<Map<String, String>?> showEditDeviceDialog(
  BuildContext context,
  SensorDevice device,
) {
  return showDialog<Map<String, String>>(
    context: context,
    builder: (_) => _EditDeviceDialog(device: device),
  );
}

class _EditDeviceDialog extends StatefulWidget {
  final SensorDevice device;
  const _EditDeviceDialog({required this.device});

  @override
  State<_EditDeviceDialog> createState() => _EditDeviceDialogState();
}

class _EditDeviceDialogState extends State<_EditDeviceDialog> {
  late final TextEditingController _nameCtrl =
      TextEditingController(text: widget.device.name);
  String? _selectedRoom;
  List<String> _rooms = [];
  bool _loadingRooms = true;
  String? _roomsError;
  String? _formError;

  @override
  void initState() {
    super.initState();
    _selectedRoom = widget.device.room.isEmpty ? null : widget.device.room;
    _loadRooms();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadRooms() async {
    setState(() {
      _loadingRooms = true;
      _roomsError = null;
    });
    try {
      final res = await http.get(
        Uri.parse('${UserSession.baseUrl}/api/room'),
        headers: {
          if (UserSession.current != null)
            'Authorization': 'Bearer ${UserSession.current!.token}',
        },
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final List<dynamic> data = jsonDecode(res.body);
        final names = data
            .map((r) => (r['name'] ?? '').toString().trim())
            .where((n) => n.isNotEmpty)
            .toList()
          ..sort();
        // Keep the device's current room selected even if it's somehow not
        // in the fetched list (e.g. a room that was since renamed/removed).
        if (_selectedRoom != null && !names.contains(_selectedRoom)) {
          names.add(_selectedRoom!);
          names.sort();
        }
        if (!mounted) return;
        setState(() {
          _rooms = names;
          _loadingRooms = false;
        });
      } else {
        if (!mounted) return;
        setState(() {
          _loadingRooms = false;
          _roomsError = 'Could not load rooms (${res.statusCode}).';
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingRooms = false;
        _roomsError = 'Could not load rooms. Check your connection.';
      });
    }
  }

  void _save() {
    final name = _nameCtrl.text.trim();
    final room = _selectedRoom?.trim() ?? '';
    if (name.isEmpty || room.isEmpty) {
      setState(() => _formError = 'Please enter a name and choose a room.');
      return;
    }
    Navigator.of(context).pop({'name': name, 'room': room});
  }

  Widget _roomField() {
    if (_loadingRooms) {
      return InputDecorator(
        decoration: InputDecoration(
          labelText: 'Room',
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        ),
        child: const Row(
          children: [
            SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 12),
            Text('Loading rooms...', style: TextStyle(color: Colors.black54)),
          ],
        ),
      );
    }

    if (_roomsError != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_roomsError!, style: const TextStyle(color: Colors.red)),
          const SizedBox(height: 6),
          TextButton.icon(
            onPressed: _loadRooms,
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ],
      );
    }

    return DropdownButtonFormField<String>(
      initialValue: _selectedRoom,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: 'Room',
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
      hint: const Text('Select a room'),
      items: _rooms
          .map((r) => DropdownMenuItem(value: r, child: Text(r)))
          .toList(),
      onChanged: (value) => setState(() => _selectedRoom = value),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Edit Device'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _nameCtrl,
              decoration: InputDecoration(
                labelText: 'Sensor name',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            const SizedBox(height: 12),
            _roomField(),
            if (_formError != null) ...[
              const SizedBox(height: 12),
              Text(_formError!, style: const TextStyle(color: Colors.red)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: _save,
          child: const Text('Save'),
        ),
      ],
    );
  }
}
