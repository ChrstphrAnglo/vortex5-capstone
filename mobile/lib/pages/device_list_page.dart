import 'package:flutter/material.dart';
import 'package:vortex5_application_2/app_state.dart';
import 'package:vortex5_application_2/models/sensor_device.dart';
import 'package:vortex5_application_2/pages/share_device_page.dart';
import 'package:vortex5_application_2/utils/device_dialogs.dart';

/// Admin-facing list of all devices with quick power (on/off) and reset
/// controls on each row. Opened from the Home page overflow menu.
class DeviceListPage extends StatefulWidget {
  final AppState appState;

  const DeviceListPage({super.key, required this.appState});

  @override
  State<DeviceListPage> createState() => _DeviceListPageState();
}

class _DeviceListPageState extends State<DeviceListPage> {
  static const Color _blue = Color(0xFF1E5BFF);
  final Set<String> _busy = {}; // deviceIds with an in-flight request

  @override
  void initState() {
    super.initState();
    widget.appState.addListener(_onChange);
  }

  @override
  void dispose() {
    widget.appState.removeListener(_onChange);
    super.dispose();
  }

  void _onChange() {
    if (mounted) setState(() {});
  }

  Future<void> _togglePower(SensorDevice s) async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy.add(s.id));
    final error = await widget.appState.setDevicePower(s.id, !s.enabled);
    if (!mounted) return;
    setState(() => _busy.remove(s.id));
    messenger.showSnackBar(
      SnackBar(
        content: Text(
          error ?? '${s.name} turned ${!s.enabled ? 'on' : 'off'}.',
        ),
      ),
    );
  }

  Future<void> _confirmReset(SensorDevice s) async {
    final confirmed = await confirmResetDevice(context, s);
    if (!confirmed || !mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy.add(s.id));
    final error = await widget.appState.resetDevice(s.id);
    if (!mounted) return;
    setState(() => _busy.remove(s.id));
    messenger.showSnackBar(
      SnackBar(content: Text(error ?? 'Reset command sent to ${s.name}.')),
    );
  }

  void _openShare(SensorDevice s) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ShareDevicePage(
          appState: widget.appState,
          deviceId: s.id,
          deviceName: s.name,
        ),
      ),
    );
  }

  Future<void> _editDevice(SensorDevice s) async {
    final result = await showEditDeviceDialog(context, s);
    if (result == null || !mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy.add(s.id));
    final error = await widget.appState.updateDevice(
      s.id,
      result['name']!,
      result['room']!,
    );
    if (!mounted) return;
    setState(() => _busy.remove(s.id));
    messenger.showSnackBar(
      SnackBar(content: Text(error ?? 'Device updated.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final sensors = widget.appState.sensors;

    return Scaffold(
      backgroundColor: const Color(0xFFF3F4F6),
      appBar: AppBar(
        backgroundColor: _blue,
        foregroundColor: Colors.white,
        title: const Text('List of Devices'),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: widget.appState.refreshFromBackend,
          child: sensors.isEmpty
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: const [
                    Padding(
                      padding: EdgeInsets.only(top: 80),
                      child: Center(
                        child: Text(
                          'No devices yet.',
                          style: TextStyle(color: Color(0xFF64748B)),
                        ),
                      ),
                    ),
                  ],
                )
              : ListView.builder(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(16),
                  itemCount: sensors.length,
                  itemBuilder: (ctx, i) => _deviceRow(sensors[i]),
                ),
        ),
      ),
    );
  }

  Widget _deviceRow(SensorDevice s) {
    final busy = _busy.contains(s.id);
    final isOff = !s.enabled;

    final String badgeText;
    final Color badgeBg;
    final Color badgeFg;
    if (isOff) {
      badgeText = 'Off';
      badgeBg = const Color(0xFFF1F5F9);
      badgeFg = const Color(0xFF64748B);
    } else {
      switch (s.status) {
        case SensorStatus.active:
          badgeText = 'Online';
          badgeBg = const Color(0xFFDCFCE7);
          badgeFg = const Color(0xFF15803D);
        case SensorStatus.available:
          badgeText = 'No Data';
          badgeBg = const Color(0xFFFEF3C7);
          badgeFg = const Color(0xFF92400E);
        case SensorStatus.offline:
          badgeText = 'Inactive';
          badgeBg = const Color(0xFFFEE2E2);
          badgeFg = const Color(0xFF991B1B);
      }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: (isOff ? const Color(0xFF94A3B8) : _blue)
                  .withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(
              Icons.sensors,
              color: isOff ? const Color(0xFF94A3B8) : _blue,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  s.name.isEmpty ? s.id : s.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: badgeBg,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        badgeText,
                        style: TextStyle(
                          color: badgeFg,
                          fontWeight: FontWeight.w700,
                          fontSize: 10,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        s.room.isEmpty ? '—' : s.room,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFF64748B),
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (busy)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else ...[
            // Edit (rename / change room)
            IconButton(
              tooltip: 'Edit',
              onPressed: () => _editDevice(s),
              icon: const Icon(Icons.edit_outlined, color: Color(0xFF64748B)),
            ),
            // Power on/off
            IconButton(
              tooltip: isOff ? 'Turn on' : 'Turn off',
              onPressed: () => _togglePower(s),
              icon: Icon(
                Icons.power_settings_new,
                color: isOff ? const Color(0xFF15803D) : const Color(0xFFDC2626),
              ),
            ),
            // Reset
            IconButton(
              tooltip: 'Reset',
              onPressed: () => _confirmReset(s),
              icon: const Icon(Icons.restart_alt, color: Color(0xFFD97706)),
            ),
            // Share
            IconButton(
              tooltip: 'Share',
              onPressed: () => _openShare(s),
              icon: const Icon(Icons.share, color: Color(0xFF64748B)),
            ),
          ],
        ],
      ),
    );
  }
}
