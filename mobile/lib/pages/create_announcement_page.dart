import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import '../models/bulletin_post.dart';
import '../models/user_session.dart';

class CreateAnnouncementPage extends StatefulWidget {
  const CreateAnnouncementPage({super.key});

  @override
  State<CreateAnnouncementPage> createState() => _CreateAnnouncementPageState();
}

class _CreateAnnouncementPageState extends State<CreateAnnouncementPage> {
  static const _categories = [
    'Events',
    'System Updates',
    'Achievements',
    'Reminders',
  ];

  final _titleCtrl = TextEditingController();
  final _messageCtrl = TextEditingController();
  String _category = 'Events';
  bool _pinned = false;
  bool _posting = false;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _messageCtrl.dispose();
    super.dispose();
  }

  Map<String, String> _headers() {
    final token = UserSession.current?.token ?? '';
    return {
      'Content-Type': 'application/json',
      if (token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  Future<void> _post() async {
    final messenger = ScaffoldMessenger.of(context);

    if (_titleCtrl.text.trim().isEmpty || _messageCtrl.text.trim().isEmpty) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Title and message are required.')),
      );
      return;
    }

    setState(() => _posting = true);

    try {
      final now = DateTime.now();
      final uri = Uri.parse('${UserSession.baseUrl}/api/announcements');
      final res = await http
          .post(
            uri,
            headers: _headers(),
            body: jsonEncode({
              'title': _titleCtrl.text.trim(),
              'description': _messageCtrl.text.trim(),
              'category': _category,
              'pinned': _pinned,
              'date':
                  '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}',
              'time': '${now.hour}:${now.minute.toString().padLeft(2, '0')}',
            }),
          )
          .timeout(const Duration(seconds: 30));

      if (!mounted) return;
      setState(() => _posting = false);

      if (res.statusCode == 200) {
        final created = BulletinPost.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
        Navigator.pop(context, created);
      } else {
        String message = 'Failed to post announcement.';
        try {
          final data = jsonDecode(res.body) as Map<String, dynamic>;
          message = data['error']?.toString() ?? message;
        } catch (_) {}
        messenger.showSnackBar(SnackBar(content: Text(message)));
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _posting = false);
      messenger.showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: const Color(0xFF0F172A),
        title: Text('New Announcement',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 20)),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
        children: [
          _label('Title'),
          TextField(controller: _titleCtrl, decoration: _fieldDeco()),
          const SizedBox(height: 16),
          _label('Message'),
          TextField(
            controller: _messageCtrl,
            maxLines: 5,
            decoration: _fieldDeco(),
          ),
          const SizedBox(height: 16),
          _label('Category'),
          DropdownButtonFormField<String>(
            initialValue: _category,
            decoration: _fieldDeco(),
            items: _categories
                .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                .toList(),
            onChanged: (value) => setState(() => _category = value ?? 'Events'),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFD8E4EA)),
            ),
            child: SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('Pin this announcement',
                  style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 14)),
              value: _pinned,
              activeTrackColor: const Color(0xFF1E88FF),
              onChanged: (value) => setState(() => _pinned = value),
            ),
          ),
          const SizedBox(height: 28),
          SizedBox(
            height: 54,
            child: ElevatedButton(
              onPressed: _posting ? null : _post,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1E88FF),
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              child: _posting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Post Announcement', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }

  static Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          text,
          style: GoogleFonts.inter(fontWeight: FontWeight.w600, color: const Color(0xFF111827)),
        ),
      );

  static InputDecoration _fieldDeco() {
    return InputDecoration(
      filled: true,
      fillColor: const Color(0xFFF8FAFC),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0xFFD8E4EA)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0xFF1E88FF), width: 1.4),
      ),
    );
  }
}
