import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../../models/user_session.dart';

class ProvisioningNamingPage extends StatefulWidget {
  final String deviceId;

  const ProvisioningNamingPage({super.key, required this.deviceId});

  @override
  State<ProvisioningNamingPage> createState() => _ProvisioningNamingPageState();
}

class _ProvisioningNamingPageState extends State<ProvisioningNamingPage> {
  final _nameCtrl = TextEditingController();
  bool _submitting = false;
  String? _error;

  // Room dropdown state
  List<String> _rooms = [];
  String? _selectedRoom;
  bool _loadingRooms = true;
  String? _roomsError;

  // A sensor's deviceId comes from its fixed hardware MAC address, so it's
  // the same every time it's re-provisioned (e.g. after a Wi-Fi reset) —
  // it's never actually "new" from the backend's point of view. If it's
  // already registered, pre-fill its existing name/room instead of forcing
  // the admin to type them again; this becomes a "reconnected" moment
  // rather than a required naming step.
  bool _isReconnect = false;
  bool _checkingExisting = true;

  @override
  void initState() {
    super.initState();
    _loadRooms();
    _checkExisting();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _checkExisting() async {
    try {
      final res = await http.get(
        Uri.parse('${UserSession.baseUrl}/api/device'),
        headers: {
          if (UserSession.current != null)
            'Authorization': 'Bearer ${UserSession.current!.token}',
        },
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final List<dynamic> data = jsonDecode(res.body);
        final existing = data.cast<Map<String, dynamic>>().firstWhere(
              (d) => d['deviceId']?.toString() == widget.deviceId,
              orElse: () => const {},
            );
        if (existing.isNotEmpty && mounted) {
          setState(() {
            _isReconnect = true;
            _nameCtrl.text = (existing['name'] ?? '').toString();
            final room = (existing['room'] ?? '').toString();
            _selectedRoom = room.isEmpty ? null : room;
          });
        }
      }
    } catch (_) {
      // Couldn't check — fall back to treating it as a new device, which is
      // the safe default (just means an extra name/room prompt, not data loss).
    } finally {
      if (mounted) setState(() => _checkingExisting = false);
    }
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
        setState(() {
          _rooms = names;
          _loadingRooms = false;
        });
      } else {
        setState(() {
          _loadingRooms = false;
          _roomsError = 'Could not load rooms (${res.statusCode}).';
        });
      }
    } catch (e) {
      setState(() {
        _loadingRooms = false;
        _roomsError = 'Could not load rooms. Check your connection.';
      });
    }
  }

  Future<void> _submit() async {
    final name = _nameCtrl.text.trim();
    final room = _selectedRoom?.trim() ?? '';
    if (name.isEmpty || room.isEmpty) {
      setState(() => _error = 'Please enter a name and choose a room.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final res = await http
          .post(
            Uri.parse('${UserSession.baseUrl}/api/device'),
            headers: {
              'Content-Type': 'application/json',
              if (UserSession.current != null)
                'Authorization': 'Bearer ${UserSession.current!.token}',
            },
            body: jsonEncode({
              'deviceId': widget.deviceId,
              'name': name,
              'room': room,
            }),
          )
          .timeout(const Duration(seconds: 10));

      if (res.statusCode != 200) {
        setState(() {
          _submitting = false;
          _error = 'Server rejected registration (${res.statusCode}).';
        });
        return;
      }

      if (!mounted) return;
      // Pop back to device page with a success result so it can refresh.
      Navigator.of(context).popUntil((route) => route.isFirst);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$name added in $room')),
      );
    } catch (e) {
      setState(() {
        _submitting = false;
        _error =
            'Could not reach the server. Make sure your phone is back on Wi-Fi with internet.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E5BFF),
        foregroundColor: Colors.white,
        title: Text(_isReconnect ? 'Sensor Reconnected' : 'Name Your Sensor'),
        automaticallyImplyLeading: false,
      ),
      body: AbsorbPointer(
        absorbing: _submitting || _checkingExisting,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.check_circle,
                color: Color(0xFF0A9A40),
                size: 56,
              ),
              const SizedBox(height: 12),
              Text(
                _isReconnect ? 'Sensor reconnected!' : 'Sensor configured!',
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              Text(
                _isReconnect
                    ? '${widget.deviceId} is back online on the new network. '
                        "It kept its name and room — change them below if you'd like, "
                        'or just tap Finish.'
                    : '${widget.deviceId} should now be online. Give it a name and a '
                        'room so you can find it later.',
                style: const TextStyle(color: Colors.black54, height: 1.4),
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _nameCtrl,
                decoration: InputDecoration(
                  labelText: 'Sensor name',
                  hintText: 'e.g. Front of classroom',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              _roomField(),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: Colors.red)),
              ],
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1E5BFF),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Finish'),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
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

    if (_rooms.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InputDecorator(
            decoration: InputDecoration(
              labelText: 'Room',
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text(
              'No rooms found',
              style: TextStyle(color: Colors.black54),
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Ask an admin to add rooms in Classroom Records on the website first.',
            style: TextStyle(color: Colors.black54, fontSize: 12),
          ),
          const SizedBox(height: 4),
          TextButton.icon(
            onPressed: _loadRooms,
            icon: const Icon(Icons.refresh),
            label: const Text('Reload rooms'),
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
      // Union with _selectedRoom in case the pre-filled room (from an
      // already-registered device) isn't in the fetched list — e.g. it was
      // renamed or deleted since this sensor was last set up.
      items: ({..._rooms, ?_selectedRoom}.toList()..sort())
          .map((r) => DropdownMenuItem(value: r, child: Text(r)))
          .toList(),
      onChanged: (value) => setState(() => _selectedRoom = value),
    );
  }
}
