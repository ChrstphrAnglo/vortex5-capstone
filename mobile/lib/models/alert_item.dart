enum AlertType { aqi, advisory, reminder }

class AlertItem {
  final String key;
  final String title;
  final String message;
  final AlertType type;
  final DateTime createdAt;
  bool isRead;
  // Raw backend field this alert is about (e.g. 'Aqi', 'PM25', 'CO2') — kept
  // so the Alert page can filter by metric type. Empty for alerts that
  // aren't tied to a single sensor field.
  final String field;

  AlertItem({
    this.key = '',
    required this.title,
    required this.message,
    required this.type,
    required this.createdAt,
    this.isRead = false,
    this.field = '',
  });

  factory AlertItem.fromBackendHistory(Map<String, dynamic> json) {
    final deviceId = json['deviceId']?.toString() ?? '';
    final field    = json['field']?.toString()    ?? '';
    final at       = json['at']?.toString()       ?? '';
    final name     = json['name']?.toString()     ?? 'Unknown sensor';
    final room     = json['room']?.toString()     ?? '';
    final value    = (json['value'] as num?)?.toStringAsFixed(1) ?? '--';
    final limit    = (json['limit'] as num?)?.toStringAsFixed(0) ?? '--';
    final severity = json['severity']?.toString() ?? 'warning';

    final fieldLabel = _fieldLabel(field);
    final title = severity == 'high'
        ? 'High Alert — $name'
        : 'Warning — $name';
    final roomPart = room.isNotEmpty ? ' in $room' : '';
    final message = '$fieldLabel reached $value (limit: $limit)$roomPart.';

    return AlertItem(
      key: '$deviceId|$field|$at',
      title: title,
      message: message,
      type: AlertType.aqi,
      createdAt: DateTime.tryParse(at) ?? DateTime.now(),
      isRead: false,
      field: field,
    );
  }

  static String fieldLabel(String field) => _fieldLabel(field);

  static String _fieldLabel(String field) {
    switch (field) {
      case 'Aqi':          return 'AQI';
      case 'PM25':         return 'PM2.5';
      case 'PM10':         return 'PM10';
      case 'CO2':          return 'CO₂';
      case 'TVOC':         return 'TVOC';
      case 'Formaldehyde': return 'Formaldehyde';
      default:             return field;
    }
  }
}
