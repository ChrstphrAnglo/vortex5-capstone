import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/user_session.dart';
import '../widgets/role_badge.dart';
import 'edit_profile_page.dart';

class ViewProfilePage extends StatefulWidget {
  const ViewProfilePage({super.key});

  @override
  State<ViewProfilePage> createState() => _ViewProfilePageState();
}

class _ViewProfilePageState extends State<ViewProfilePage> {
  @override
  Widget build(BuildContext context) {
    final u = UserSession.current;
    final fullName = u == null ? '' : '${u.firstName} ${u.lastName}'.trim();

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: const Color(0xFF0F172A),
        title: Text('Profile',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 20)),
        actions: [
          IconButton(
            tooltip: 'Edit Profile',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const EditProfilePage()),
            ).then((_) => setState(() {})),
            icon: const Icon(Icons.edit_outlined),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        children: [
          Center(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 42,
                  backgroundColor: const Color(0xFF6988FF),
                  backgroundImage: _resolvePictureUrl(u?.pictureUrl) != null
                      ? NetworkImage(_resolvePictureUrl(u?.pictureUrl)!)
                      : null,
                  onBackgroundImageError:
                      _resolvePictureUrl(u?.pictureUrl) != null
                          ? (_, _) {}
                          : null,
                  child: _resolvePictureUrl(u?.pictureUrl) == null
                      ? Text(
                          _initials(),
                          style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 22),
                        )
                      : null,
                ),
                const SizedBox(height: 12),
                Text(
                  fullName.isEmpty ? 'No name set' : fullName,
                  style: GoogleFonts.poppins(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFF0F172A),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),
          _detailRow('Email', u?.email ?? ''),
          const Divider(height: 1),
          _detailRow('Teacher ID', u?.teacherId ?? ''),
          const Divider(height: 1),
          _detailRow('Department', u?.department ?? ''),
          const Divider(height: 1),
          _detailRow('Staff Type', u?.staffType ?? ''),
          const Divider(height: 1),
          _detailRow('Role', '', valueWidget: RoleBadge(role: u?.role ?? '')),
          const Divider(height: 1),
          _detailRow('Member Since', _formatDate(u?.createdAt)),
          const Divider(height: 1),
        ],
      ),
    );
  }

  Widget _detailRow(String label, String value, {Widget? valueWidget}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Row(
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: GoogleFonts.inter(color: const Color(0xFF64748B), fontSize: 13),
            ),
          ),
          Expanded(
            child: Align(
              alignment: Alignment.centerRight,
              child: valueWidget ??
                  Text(
                    value.isEmpty ? '—' : value,
                    style: GoogleFonts.inter(
                      color: const Color(0xFF0F172A),
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                    textAlign: TextAlign.right,
                  ),
            ),
          ),
        ],
      ),
    );
  }

  String? _resolvePictureUrl(String? pictureUrl) {
    if (pictureUrl == null || pictureUrl.trim().isEmpty) return null;
    if (pictureUrl.startsWith('http')) return pictureUrl;
    return '${UserSession.baseUrl}$pictureUrl';
  }

  String _initials() {
    final u = UserSession.current;
    if (u == null) return 'U';
    final a = u.firstName.trim().isNotEmpty ? u.firstName.trim()[0] : '';
    final b = u.lastName.trim().isNotEmpty ? u.lastName.trim()[0] : '';
    final result = (a + b).toUpperCase();
    return result.isEmpty ? 'U' : result;
  }

  static const _months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  String _formatDate(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    final date = DateTime.tryParse(iso);
    if (date == null) return '';
    return '${_months[date.month - 1]} ${date.day}, ${date.year}';
  }
}
