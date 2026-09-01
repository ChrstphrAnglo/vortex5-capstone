import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:vortex5_application_2/app_state.dart';
import 'package:vortex5_application_2/models/sensor_device.dart';
import 'package:vortex5_application_2/pages/device_list_page.dart';
import 'package:vortex5_application_2/pages/share_device_page.dart';
import 'package:vortex5_application_2/utils/aqi_colors.dart';
import 'package:vortex5_application_2/utils/device_dialogs.dart';
import 'package:vortex5_application_2/widgets/error_state.dart';

class HomePage extends StatefulWidget {
  final AppState appState;

  const HomePage({
    super.key,
    required this.appState,
  });

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final PageController _pageController = PageController();
  int _index = 0;
  bool _refreshing = false;

  // Forgetting Wi-Fi is fire-and-forget over MQTT — the backend has no way
  // to confirm the device actually rebooted, so this is honest "the command
  // was sent, the device should be restarting" feedback, not a true
  // completion signal. Cleared automatically after a short window.
  String? _resettingId;
  Timer? _resettingTimer;

  /// 'all' = show every sensor, otherwise the room name to focus on.
  String _selectedRoom = 'all';

  @override
  void initState() {
    super.initState();
    widget.appState.addListener(_handleStateChange);
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncActiveToIndex());
  }

  @override
  void dispose() {
    widget.appState.removeListener(_handleStateChange);
    _pageController.dispose();
    _resettingTimer?.cancel();
    super.dispose();
  }

  /// Sensors after applying the room filter.
  List<SensorDevice> get _filtered {
    final all = widget.appState.sensors;
    if (_selectedRoom == 'all') return all;
    return all.where((s) => s.room.trim() == _selectedRoom).toList();
  }

  void _handleStateChange() {
    if (!mounted) return;
    // Keep the page index within bounds if the (filtered) device list changed.
    final count = _filtered.length;
    if (count > 0 && _index >= count) {
      _index = count - 1;
      if (_pageController.hasClients) {
        _pageController.jumpToPage(_index);
      }
    }
    setState(() {});
  }

  void _syncActiveToIndex() {
    final sensors = _filtered;
    if (sensors.isEmpty) return;
    final i = _index.clamp(0, sensors.length - 1);
    widget.appState.connectSensor(sensors[i].id);
  }

  Future<void> _refresh() async {
    setState(() => _refreshing = true);
    await widget.appState.refreshFromBackend();
    if (mounted) setState(() => _refreshing = false);
  }

  void _onRoomChanged(String? room) {
    if (room == null) return;
    setState(() {
      _selectedRoom = room;
      _index = 0;
    });
    if (_pageController.hasClients) _pageController.jumpToPage(0);
    _syncActiveToIndex();
  }

  void _goTo(int i) {
    final sensors = _filtered;
    if (i < 0 || i >= sensors.length) return;
    _pageController.animateToPage(
      i,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOut,
    );
  }

  // ----- Admin actions on the current sensor -----
  SensorDevice? get _current {
    final sensors = _filtered;
    if (sensors.isEmpty) return null;
    return sensors[_index.clamp(0, sensors.length - 1)];
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

  void _openDeviceList() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DeviceListPage(appState: widget.appState),
      ),
    );
  }

  Future<void> _confirmReset(SensorDevice s) async {
    final confirmed = await confirmResetDevice(context, s);
    if (!confirmed || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final error = await widget.appState.resetDevice(s.id);
    if (!mounted) return;

    if (error == null) {
      // No real "done" signal exists for this (fire-and-forget MQTT command),
      // so just hold a "Forgetting Wi-Fi..." state on the AQI display for a
      // fixed window rather than claiming to know when it actually finishes.
      _resettingTimer?.cancel();
      setState(() => _resettingId = s.id);
      _resettingTimer = Timer(const Duration(seconds: 15), () {
        if (mounted) setState(() => _resettingId = null);
      });
    }

    messenger.showSnackBar(
      SnackBar(content: Text(error ?? 'Forgetting Wi-Fi on ${s.name}...')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final sensors = _filtered;

    // Tint the background by the currently shown sensor's air quality.
    final cur = _current;
    final curReading =
        (cur != null && cur.enabled) ? widget.appState.readingFor(cur.id) : null;
    final tint = curReading != null
        ? aqiColorFor(curReading.aqi)
        : const Color(0xFF94A3B8);

    return Scaffold(
      backgroundColor: const Color(0xFFF4F8F5),
      appBar: _appBar(),
      body: AnimatedContainer(
        duration: const Duration(milliseconds: 400),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              tint.withValues(alpha: 0.16),
              const Color(0xFFF4F8F5),
            ],
            stops: const [0.0, 0.45],
          ),
        ),
        child: SafeArea(
          top: false,
          bottom: false,
          child: Column(
            children: [
              _roomFilter(),
              Expanded(
                child: widget.appState.sensors.isEmpty &&
                        widget.appState.refreshError != null
                    ? ErrorState(
                        title: 'Could not load devices',
                        message: widget.appState.refreshError!,
                        onRetry: () => widget.appState.refreshFromBackend(),
                      )
                    : sensors.isEmpty
                        ? _emptyState()
                        : _carousel(sensors),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ======== AppBar (matches the Connect tab style) ========
  PreferredSizeWidget _appBar() {
    const blue = Color(0xFF1E5BFF);
    return AppBar(
      backgroundColor: blue,
      elevation: 0,
      title: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Image.asset(
            'assets/images/bewair_logo_white.png',
            height: 28,
            fit: BoxFit.contain,
          ),
          const SizedBox(width: 10),
          Text(
            'BewAir',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 22,
              letterSpacing: 1.4,
            ),
          ),
        ],
      ),
      actions: [
        // Refresh
        IconButton(
          tooltip: 'Refresh',
          onPressed: _refreshing ? null : _refresh,
          icon: _refreshing
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.refresh, color: Colors.white),
        ),
        // Overflow menu (admin device actions + list of devices)
        if (widget.appState.isAdmin)
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert, color: Colors.white),
            onSelected: (value) {
              final cur = _current;
              if (value == 'list') {
                _openDeviceList();
              } else if (value == 'share' && cur != null) {
                _openShare(cur);
              } else if (value == 'reset' && cur != null) {
                _confirmReset(cur);
              }
            },
            itemBuilder: (_) => [
              const PopupMenuItem(
                value: 'share',
                child: ListTile(
                  leading: Icon(Icons.share),
                  title: Text('Share Device'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'reset',
                child: ListTile(
                  leading: Icon(Icons.wifi_off, color: Colors.orange),
                  title: Text('Forget Wi-Fi'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'list',
                child: ListTile(
                  leading: Icon(Icons.list_alt),
                  title: Text('List of Devices'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ],
          ),
      ],
    );
  }

  // ======== Room focus dropdown ========
  Widget _roomFilter() {
    final rooms = widget.appState.rooms;
    final items = <String>['all', ...rooms];
    // Guard against a stale selection after a room disappears.
    final value = items.contains(_selectedRoom) ? _selectedRoom : 'all';

    return Center(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
        child: Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(999),
          elevation: 1,
          shadowColor: Colors.black.withValues(alpha: 0.08),
          child: Padding(
            padding: const EdgeInsets.only(left: 16, right: 8),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: value,
                isDense: true,
                borderRadius: BorderRadius.circular(16),
                icon: const Icon(Icons.keyboard_arrow_down,
                    size: 22, color: Color(0xFF64748B)),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF0F172A),
                ),
                items: items
                    .map((r) => DropdownMenuItem(
                          value: r,
                          child: Text(r == 'all' ? 'All Rooms' : r),
                        ))
                    .toList(),
                onChanged: _onRoomChanged,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _emptyState() {
    final filtering = _selectedRoom != 'all';
    final String message;
    if (filtering) {
      message = 'No sensors in "$_selectedRoom".';
    } else if (widget.appState.isAdmin) {
      message = 'No sensors yet.\nAdd one from the Connect tab.';
    } else {
      message = 'No sensors shared with you.\nAsk an admin to share one.';
    }
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(
            height: 360,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.sensors_off,
                        size: 56, color: Colors.black38),
                    const SizedBox(height: 12),
                    Text(
                      message,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.black54),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ======== Swipeable per-sensor carousel ========
  Widget _carousel(List<SensorDevice> sensors) {
    return Column(
      children: [
        Expanded(
          child: PageView.builder(
            controller: _pageController,
            itemCount: sensors.length,
            onPageChanged: (i) {
              _index = i;
              widget.appState.connectSensor(sensors[i].id);
              setState(() {});
            },
            itemBuilder: (ctx, i) {
              return RefreshIndicator(
                onRefresh: _refresh,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                  children: [
                    _SensorPanel(
                      sensor: sensors[i],
                      reading: widget.appState.readingFor(sensors[i].id),
                      threshold: widget.appState.aqiThreshold,
                      resetting: _resettingId == sensors[i].id,
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        _navBar(sensors.length),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _navBar(int count) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            onPressed: _index > 0 ? () => _goTo(_index - 1) : null,
            icon: const Icon(Icons.chevron_left),
            style: IconButton.styleFrom(
              backgroundColor: Colors.white,
              disabledBackgroundColor: const Color(0xFFF1F5F9),
            ),
          ),
          // Dot indicator
          Row(
            mainAxisSize: MainAxisSize.min,
            children: List.generate(count, (i) {
              final active = i == _index;
              return AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: active ? 18 : 7,
                height: 7,
                decoration: BoxDecoration(
                  color: active
                      ? const Color(0xFF1E88FF)
                      : const Color(0xFFCBD5E1),
                  borderRadius: BorderRadius.circular(4),
                ),
              );
            }),
          ),
          IconButton(
            onPressed: _index < count - 1 ? () => _goTo(_index + 1) : null,
            icon: const Icon(Icons.chevron_right),
            style: IconButton.styleFrom(
              backgroundColor: Colors.white,
              disabledBackgroundColor: const Color(0xFFF1F5F9),
            ),
          ),
        ],
      ),
    );
  }

}

/// Self-contained detail card for a single sensor. Reads only from the passed
/// sensor + reading so neighbouring PageView pages don't show the active one.
class _SensorPanel extends StatelessWidget {
  final SensorDevice sensor;
  final SensorReadings? reading;
  final double threshold;
  final bool resetting;

  const _SensorPanel({
    required this.sensor,
    required this.reading,
    required this.threshold,
    this.resetting = false,
  });

  @override
  Widget build(BuildContext context) {
    final isOff = !sensor.enabled;
    final hasReading = reading != null && !isOff;
    final aqi = reading?.aqi ?? 0;
    final color = !hasReading ? const Color(0xFF94A3B8) : aqiColorFor(aqi);

    final components = <_Component>[
      _Component('PM2.5', 'µg/m³', reading?.pm25, 1, Icons.blur_on, 'pm25'),
      _Component('PM10', 'µg/m³', reading?.pm10, 1, Icons.grain, 'pm10'),
      _Component('CO₂', 'ppm', reading?.co2, 0, Icons.air, 'co2'),
      _Component('TVOC', 'µg/m³', reading?.tvoc, 0, Icons.bubble_chart_outlined, 'tvoc'),
      _Component('Temperature', '°C', reading?.temperature, 1, Icons.device_thermostat, 'temp'),
      _Component('Humidity', '%', reading?.humidity, 0, Icons.opacity, 'humidity'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const SizedBox(height: 6),

        // Radial AQI gauge
        SizedBox(
          width: 280,
          height: 172,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // soft halo behind the dial
              if (hasReading)
                Align(
                  alignment: const Alignment(0, 0.45),
                  child: Container(
                    width: 150,
                    height: 150,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [
                          color.withValues(alpha: 0.20),
                          color.withValues(alpha: 0.0),
                        ],
                      ),
                    ),
                  ),
                ),
              Positioned.fill(
                child: CustomPaint(
                  painter: _GaugePainter(aqi: aqi, hasData: hasReading),
                ),
              ),
              // centered value — replaced with a spinner while a "forget
              // Wi-Fi" command was just sent, since the reading will be
              // stale/meaningless until the device finishes reconnecting.
              Align(
                alignment: const Alignment(0, 0.55),
                child: resetting
                    ? const Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          SizedBox(
                            width: 28,
                            height: 28,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.5,
                              color: Color(0xFFD97706),
                            ),
                          ),
                          SizedBox(height: 8),
                          Text(
                            'Forgetting\nWi-Fi...',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Color(0xFFD97706),
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              height: 1.2,
                            ),
                          ),
                        ],
                      )
                    : Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            isOff ? '—' : (hasReading ? '$aqi' : '--'),
                            style: TextStyle(
                              color: color,
                              fontSize: 46,
                              fontWeight: FontWeight.w800,
                              height: 1,
                            ),
                          ),
                          const SizedBox(height: 2),
                          const Text(
                            'AQI',
                            style: TextStyle(
                              color: Color(0xFF64748B),
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.5,
                            ),
                          ),
                        ],
                      ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),

        // Category word
        Text(
          resetting
              ? 'Forgetting Wi-Fi'
              : isOff
                  ? 'Device Off'
                  : (hasReading ? reading!.aqiLabel : 'No Data'),
          style: TextStyle(
            color: color,
            fontSize: 32,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 14),

        // Sensor name + room (AirNow-style "location")
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                sensor.name.isEmpty ? sensor.id : sensor.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF0F172A),
                ),
              ),
            ),
            const SizedBox(width: 8),
            _StatusBadge(status: sensor.status, enabled: sensor.enabled),
          ],
        ),
        if (hasReading) ...[
          const SizedBox(height: 6),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.access_time_rounded,
                  size: 12, color: Color(0xFF94A3B8)),
              const SizedBox(width: 4),
              Text(
                'Updated ${_timeAgo(reading!.updatedAt)}',
                style: const TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: 20),

        // Recommended actions for the current AQI (EPA AirNow guidance)
        if (hasReading) ...[
          _RecommendedActionsCard(aqi: aqi, color: color),
          const SizedBox(height: 20),
        ],

        // Component list — tap a row for an insight
        Align(
          alignment: Alignment.centerLeft,
          child: Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text(
              'Air Components',
              style: TextStyle(
                color: const Color(0xFF0F172A),
                fontSize: 15,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
        _componentsCard(context, components, hasReading),
      ],
    );
  }

  Widget _componentsCard(
      BuildContext context, List<_Component> comps, bool hasReading) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Column(
          children: [
            for (var i = 0; i < comps.length; i++) ...[
              if (i > 0)
                const Divider(
                  height: 1,
                  thickness: 1,
                  indent: 16,
                  endIndent: 16,
                  color: Color(0xFFEEF2F6),
                ),
              _componentRow(context, comps[i], hasReading),
            ],
          ],
        ),
      ),
    );
  }

  Widget _componentRow(BuildContext context, _Component c, bool hasReading) {
    final hasValue = hasReading && c.value != null;
    final insight = hasValue ? _insightFor(c.key, c.value!) : null;
    final dotColor = insight?.color ?? const Color(0xFFCBD5E1);
    final valueText = hasValue ? c.value!.toStringAsFixed(c.decimals) : '--';

    return InkWell(
      onTap: hasValue ? () => _showInsight(context, c, insight!) : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: Row(
          children: [
            Container(
              width: 14,
              height: 14,
              decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
            ),
            const SizedBox(width: 14),
            Icon(c.icon, size: 24, color: const Color(0xFF64748B)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    c.label,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF0F172A),
                      fontSize: 17,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    insight?.level ?? 'No data',
                    style: TextStyle(
                      color: dotColor,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            Text.rich(
              TextSpan(
                text: valueText,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 20,
                  color: Color(0xFF0F172A),
                ),
                children: [
                  TextSpan(
                    text: '  ${c.unit}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w500,
                      fontSize: 12,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                ],
              ),
            ),
            if (hasValue)
              const Padding(
                padding: EdgeInsets.only(left: 6),
                child: Icon(Icons.chevron_right, color: Color(0xFFCBD5E1)),
              ),
          ],
        ),
      ),
    );
  }

  void _showInsight(BuildContext context, _Component c, _Insight insight) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(c.icon, color: const Color(0xFF1E5BFF)),
                const SizedBox(width: 10),
                Text(
                  c.label,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  c.value!.toStringAsFixed(c.decimals),
                  style: TextStyle(
                    fontSize: 40,
                    fontWeight: FontWeight.w800,
                    color: insight.color,
                    height: 1,
                  ),
                ),
                const SizedBox(width: 4),
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(
                    c.unit,
                    style: const TextStyle(color: Color(0xFF94A3B8)),
                  ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: insight.color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    insight.level,
                    style: TextStyle(
                      color: insight.color,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              insight.advice,
              style: const TextStyle(
                color: Color(0xFF334155),
                height: 1.5,
                fontSize: 15,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One air-quality component shown as a row + insight sheet.
class _Component {
  final String label;
  final String unit;
  final double? value;
  final int decimals;
  final IconData icon;
  final String key;

  const _Component(this.label, this.unit, this.value, this.decimals, this.icon, this.key);
}

class _Insight {
  final String level;
  final Color color;
  final String advice;
  const _Insight(this.level, this.color, this.advice);
}

// Recommended actions for the current AQI category (U.S. EPA AirNow guidance).
List<String> _aqiActions(int aqi) {
  if (aqi <= 50) {
    return [
      'Air quality is healthy — normal activities are fine.',
      'Keep windows open for fresh-air ventilation.',
    ];
  }
  if (aqi <= 100) {
    return [
      'Air quality is acceptable.',
      'Unusually sensitive people should watch for symptoms during long or heavy activity.',
    ];
  }
  if (aqi <= 150) {
    return [
      'Sensitive groups (children, elderly, asthma) should limit prolonged or heavy exertion.',
      'Move strenuous activities indoors and improve ventilation.',
    ];
  }
  if (aqi <= 200) {
    return [
      'Everyone should limit prolonged outdoor exertion.',
      'Close windows and run a HEPA / MERV-13+ air purifier.',
      'Sensitive groups should stay indoors.',
    ];
  }
  if (aqi <= 300) {
    return [
      'Everyone should avoid outdoor exertion and stay indoors.',
      'Seal the room and run an air purifier; wear an N95 if you must go out.',
      'Avoid indoor pollution — no frying, vacuuming, or candles.',
    ];
  }
  return [
    'Health emergency — everyone stay indoors with windows shut and air filtered.',
    'Wear an N95 outdoors; relocate to a clean-air shelter if the room cannot stay clean.',
    'Seek medical help for any breathing difficulty.',
  ];
}

/// Returns a qualitative reading + advice for a component value.
_Insight _insightFor(String key, double v) {
  switch (key) {
    case 'pm25':
      if (v <= 12) return const _Insight('Good', aqiGood, 'Fine-particle (PM2.5) levels are healthy. No action needed.');
      if (v <= 35.4) return const _Insight('Moderate', aqiModerate, 'Acceptable. Unusually sensitive people should watch for symptoms during long exposure.');
      if (v <= 55.4) return const _Insight('Unhealthy (SG)', aqiUsg, 'Sensitive groups (asthma, children, elderly) may feel effects. Improve ventilation or run an air purifier.');
      if (v <= 150.4) return const _Insight('Unhealthy', aqiUnhealthy, 'Everyone may start to feel effects. Reduce indoor sources (smoke, cooking) and filter the air.');
      return const _Insight('Very Unhealthy', aqiVeryUnhealthy, 'Heavy fine-particle pollution. Limit exposure and filter the air immediately.');
    case 'pm10':
      if (v <= 54) return const _Insight('Good', aqiGood, 'Coarse-particle (PM10) levels are healthy.');
      if (v <= 154) return const _Insight('Moderate', aqiModerate, 'Acceptable dust levels. Sensitive people should limit long exposure.');
      if (v <= 254) return const _Insight('Unhealthy (SG)', aqiUsg, 'Elevated dust. Sensitive groups should improve ventilation.');
      if (v <= 354) return const _Insight('Unhealthy', aqiUnhealthy, 'High dust levels. Reduce sources and filter the air.');
      return const _Insight('Very Unhealthy', aqiVeryUnhealthy, 'Very high dust. Limit exposure and filter the air now.');
    case 'co2':
      if (v <= 800) return const _Insight('Good', aqiGood, 'The space is well-ventilated.');
      if (v <= 1000) return const _Insight('Moderate', aqiModerate, 'Acceptable, but bring in fresh air if people feel drowsy.');
      if (v <= 1500) return const _Insight('Stuffy', aqiUsg, 'Air is getting stuffy. Increase ventilation.');
      if (v <= 2000) return const _Insight('Poor', aqiUnhealthy, 'Poor ventilation. Open windows or doors to bring CO₂ down.');
      return const _Insight('Very Poor', aqiVeryUnhealthy, 'High CO₂ can cause headaches and fatigue. Ventilate the room immediately.');
    case 'tvoc':
      if (v <= 300) return const _Insight('Good', aqiGood, 'Low levels of volatile organic compounds.');
      if (v <= 500) return const _Insight('Moderate', aqiModerate, 'Acceptable. Ventilate if you notice odors.');
      if (v <= 1000) return const _Insight('Elevated', aqiUsg, 'Elevated VOCs. Increase fresh air and check sources (cleaners, paint, new furniture).');
      if (v <= 3000) return const _Insight('High', aqiUnhealthy, 'High VOCs. Ventilate and remove the source.');
      return const _Insight('Very High', aqiVeryUnhealthy, 'Very high VOCs. Ventilate the room now and find the source.');
    case 'temp':
      if (v >= 20 && v <= 26) return const _Insight('Comfortable', aqiGood, 'Temperature is in the comfortable range (20–26 °C).');
      if (v >= 17 && v < 20) return const _Insight('Cool', aqiModerate, 'Slightly cool. A little below the ideal 20–26 °C range.');
      if (v > 26 && v <= 30) return const _Insight('Warm', aqiModerate, 'Slightly warm. A little above the ideal 20–26 °C range.');
      if (v < 17) return const _Insight('Cold', aqiUnhealthy, 'Too cold for comfort. Consider heating the room.');
      return const _Insight('Hot', aqiUnhealthy, 'Too warm for comfort. Improve cooling or ventilation.');
    case 'humidity':
      if (v >= 30 && v <= 60) return const _Insight('Comfortable', aqiGood, 'Humidity is in the healthy range (30–60%).');
      if (v >= 20 && v < 30) return const _Insight('Dry', aqiModerate, 'A bit dry. Below the ideal 30–60% range.');
      if (v > 60 && v <= 70) return const _Insight('Humid', aqiModerate, 'A bit humid. Above the ideal 30–60% range.');
      if (v < 20) return const _Insight('Too Dry', aqiUnhealthy, 'Very dry air can irritate eyes, skin, and airways. Consider a humidifier.');
      return const _Insight('Too Humid', aqiUnhealthy, 'High humidity encourages mold and dust mites. Improve ventilation or dehumidify.');
    default:
      return const _Insight('—', Color(0xFF94A3B8), 'No insight available.');
  }
}

class _RecommendedActionsCard extends StatefulWidget {
  final int aqi;
  final Color color;

  const _RecommendedActionsCard({required this.aqi, required this.color});

  @override
  State<_RecommendedActionsCard> createState() =>
      _RecommendedActionsCardState();
}

class _RecommendedActionsCardState extends State<_RecommendedActionsCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final actions = _aqiActions(widget.aqi);
    final color = widget.color;

    return AnimatedSize(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeInOut,
      alignment: Alignment.topCenter,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header row
            Row(
              children: [
                Icon(Icons.shield_outlined, size: 20, color: color),
                const SizedBox(width: 8),
                const Text(
                  'Recommended Actions',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: Color(0xFF0F172A),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Collapsed: first action as a single preview line
            if (!_expanded) ...[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 6, right: 8),
                    child: Container(
                      width: 6,
                      height: 6,
                      decoration:
                          BoxDecoration(color: color, shape: BoxShape.circle),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      actions.first,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF334155),
                        fontSize: 13.5,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              GestureDetector(
                onTap: () => setState(() => _expanded = true),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'See all actions',
                      style: TextStyle(
                        color: color,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(width: 2),
                    Icon(Icons.keyboard_arrow_down, size: 16, color: color),
                  ],
                ),
              ),
            ],

            // Expanded: all actions + source + collapse link
            if (_expanded) ...[
              ...actions.map(
                (a) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(top: 6, right: 8),
                        child: Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                              color: color, shape: BoxShape.circle),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          a,
                          style: const TextStyle(
                            color: Color(0xFF334155),
                            fontSize: 13.5,
                            height: 1.4,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const Text(
                'Source: U.S. EPA AirNow',
                style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
              ),
              const SizedBox(height: 8),
              GestureDetector(
                onTap: () => setState(() => _expanded = false),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Show less',
                      style: TextStyle(
                        color: color,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(width: 2),
                    Icon(Icons.keyboard_arrow_up, size: 16, color: color),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final SensorStatus status;
  final bool enabled;

  const _StatusBadge({required this.status, required this.enabled});

  @override
  Widget build(BuildContext context) {
    final Color dotColor;
    final String label;

    if (!enabled) {
      dotColor = const Color(0xFF94A3B8);
      label = 'Off';
    } else if (status == SensorStatus.offline) {
      dotColor = const Color(0xFFEF4444);
      label = 'Offline';
    } else {
      dotColor = const Color(0xFF22C55E);
      label = 'Online';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: dotColor.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: dotColor,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

String _timeAgo(DateTime dt) {
  final diff = DateTime.now().difference(dt);
  if (diff.inSeconds < 60) return '${diff.inSeconds}s ago';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  return '${diff.inDays}d ago';
}

/// Semicircular AQI gauge: equal-width category segments, a filled fan up to
/// the current value, and a white triangular needle (AirNow style).
class _GaugePainter extends CustomPainter {
  final int aqi;
  final bool hasData;

  _GaugePainter({required this.aqi, required this.hasData});

  // Equal-width category segments (each gets the same slice of the arc).
  static const _bounds = <double>[0, 50, 100, 150, 200, 300, 500];
  static const _bandColors = aqiBandColors;

  int get _segCount => _bandColors.length;

  double _angleFor(double v) {
    final span = math.pi / _segCount;
    for (var i = 0; i < _segCount; i++) {
      if (v <= _bounds[i + 1] || i == _segCount - 1) {
        final lo = _bounds[i], hi = _bounds[i + 1];
        final frac = ((v - lo) / (hi - lo)).clamp(0.0, 1.0);
        return math.pi + (i + frac) * span;
      }
    }
    return math.pi;
  }

  Color _colorFor(double v) {
    for (var i = 0; i < _segCount; i++) {
      if (v <= _bounds[i + 1]) return _bandColors[i];
    }
    return _bandColors.last;
  }

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 15.0;
    final center = Offset(size.width / 2, size.height - 6);
    final radius = (size.width - stroke) / 2 - 2;
    final rect = Rect.fromCircle(center: center, radius: radius);
    final span = math.pi / _segCount;
    const gap = 0.020; // small gap between segments

    // Colored category segments
    for (var i = 0; i < _segCount; i++) {
      final start = math.pi + i * span + gap / 2;
      final sweep = span - gap;
      final paint = Paint()
        ..color = hasData
            ? _bandColors[i]
            : _bandColors[i].withValues(alpha: 0.20)
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round;
      canvas.drawArc(rect, start, sweep, false, paint);
    }

    if (!hasData) return;

    // Marker knob sitting on the arc at the current value — keeps the dial
    // centre clear for the big number (no needle/fan overlap).
    final v = aqi.toDouble();
    final markerAngle = _angleFor(v);
    final cat = _colorFor(v);
    final dir = Offset(math.cos(markerAngle), math.sin(markerAngle));
    final markerCenter = center + dir * radius;

    // outer glow ring
    canvas.drawCircle(
      markerCenter,
      14,
      Paint()..color = cat.withValues(alpha: 0.18),
    );
    // white knob with colored border
    canvas.drawCircle(markerCenter, 10, Paint()..color = Colors.white);
    canvas.drawCircle(
      markerCenter,
      10,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5
        ..color = cat,
    );
  }

  @override
  bool shouldRepaint(covariant _GaugePainter old) =>
      old.aqi != aqi || old.hasData != hasData;
}
