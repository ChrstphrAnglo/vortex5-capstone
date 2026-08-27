import 'dart:io';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import '../models/user_session.dart';
import 'login_page.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  static const _blue = Color(0xFF1E5BFF);

  bool _uploadingPicture = false;

  Future<void> _changePicture() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 18, 20, 6),
              child: Text(
                'Change Profile Photo',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined, color: _blue),
              title: const Text('Take Photo'),
              onTap: () => Navigator.pop(sheetContext, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined, color: _blue),
              title: const Text('Choose from Gallery'),
              onTap: () => Navigator.pop(sheetContext, ImageSource.gallery),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (source == null) return;

    final picked = await ImagePicker().pickImage(
      source: source,
      maxWidth: 800,
      imageQuality: 80,
    );

    if (picked == null) return;
    if (!mounted) return;

    final messenger = ScaffoldMessenger.of(context);

    setState(() => _uploadingPicture = true);

    final err = await UserSession.uploadProfilePicture(File(picked.path));

    if (!mounted) return;
    setState(() => _uploadingPicture = false);

    if (err != null) {
      messenger.showSnackBar(SnackBar(content: Text(err)));
      return;
    }

    setState(() {});
  }

  Future<void> _editProfile() async {
    final user = UserSession.current;
    if (user == null) return;

    final firstCtrl = TextEditingController(text: user.firstName);
    final lastCtrl = TextEditingController(text: user.lastName);
    final emailCtrl = TextEditingController(text: user.email);
    String department = user.department;
    String staffType = user.staffType;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setModalState) {
          return AlertDialog(
            title: const Text('Edit Profile'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _field(firstCtrl, 'First name'),
                  const SizedBox(height: 12),
                  _field(lastCtrl, 'Last name'),
                  const SizedBox(height: 12),
                  _field(emailCtrl, 'Email'),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: department.isEmpty ? null : department,
                    decoration: _inputDecoration('Department'),
                    items: const [
                      DropdownMenuItem(value: 'Science Department', child: Text('Science Department')),
                      DropdownMenuItem(value: 'Mathematics Department', child: Text('Mathematics Department')),
                      DropdownMenuItem(value: 'English Department', child: Text('English Department')),
                      DropdownMenuItem(value: 'ICT Department', child: Text('ICT Department')),
                    ],
                    onChanged: (value) =>
                        setModalState(() => department = value ?? ''),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: staffType.isEmpty ? null : staffType,
                    decoration: _inputDecoration('Staff Type'),
                    items: const [
                      DropdownMenuItem(value: 'Teacher', child: Text('Teacher')),
                      DropdownMenuItem(value: 'Student Teacher', child: Text('Student Teacher')),
                    ],
                    onChanged: (value) =>
                        setModalState(() => staffType = value ?? ''),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () async {
                  final messenger = ScaffoldMessenger.of(context);
                  final navigator = Navigator.of(dialogContext);
                  final message = await UserSession.updateProfile(
                    firstName: firstCtrl.text,
                    lastName: lastCtrl.text,
                    email: emailCtrl.text,
                    department: department,
                    staffType: staffType,
                  );
                  if (!mounted) return;
                  if (message != null) {
                    messenger.showSnackBar(SnackBar(content: Text(message)));
                    return;
                  }
                  navigator.pop();
                  setState(() {});
                },
                child: const Text('Save'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _changePassword() async {
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final confirmCtrl = TextEditingController();

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Change Password'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _field(currentCtrl, 'Current Password', obscureText: true),
              const SizedBox(height: 12),
              _field(newCtrl, 'New Password', obscureText: true),
              const SizedBox(height: 12),
              _field(confirmCtrl, 'Confirm Password', obscureText: true),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              final messenger = ScaffoldMessenger.of(context);
              final navigator = Navigator.of(dialogContext);
              final message = await UserSession.changePassword(
                currentPassword: currentCtrl.text,
                newPassword: newCtrl.text,
                confirmPassword: confirmCtrl.text,
              );
              if (!mounted) return;
              if (message != null) {
                messenger.showSnackBar(SnackBar(content: Text(message)));
                return;
              }
              navigator.pop();
              messenger.showSnackBar(
                const SnackBar(content: Text('Password updated successfully.')),
              );
            },
            child: const Text('Update'),
          ),
        ],
      ),
    );
  }

  Future<void> _deleteAccount() async {
    final passwordCtrl = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete Account'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'This will permanently delete your account and cannot be undone.',
                style: TextStyle(color: Colors.red),
              ),
              const SizedBox(height: 16),
              _field(passwordCtrl, 'Confirm your password', obscureText: true),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Delete', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    if (!mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    final err = await UserSession.deleteAccount(passwordCtrl.text);

    if (!mounted) return;

    if (err != null) {
      messenger.showSnackBar(SnackBar(content: Text(err)));
      return;
    }

    await UserSession.logout();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginPage()),
      (route) => false,
    );
  }

  Future<void> _signOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will be returned to the login screen.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign out',
                style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await UserSession.logout();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginPage()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final u = UserSession.current;
    final fullName =
        u == null ? '' : '${u.firstName} ${u.lastName}'.trim();
    final email = u?.email ?? '';
    final staffType = u?.staffType ?? '';
    final department = u?.department ?? '';
    final role = u?.role ?? '';

    return Scaffold(
      backgroundColor: const Color(0xFFF3F4F6),
      appBar: AppBar(
        backgroundColor: _blue,
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
              'Profile',
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 22,
                letterSpacing: 1.4,
              ),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Gradient identity card ────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF355CFF), Color(0xFFA020F0)],
              ),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _avatar(u?.pictureUrl),
                const SizedBox(height: 14),
                Text(
                  fullName.isEmpty ? 'No name set' : fullName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 26,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (email.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(email,
                      style: const TextStyle(
                          color: Colors.white70, fontSize: 13)),
                ],
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    if (role.isNotEmpty) _chip(role),
                    if (staffType.isNotEmpty) _chip(staffType),
                    if (department.isNotEmpty) _chip(department),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // ── Account section ─────────────────────────────────────────
          const Text(
            'Account',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              children: [
                _settingsTile(
                  icon: Icons.person_outline_rounded,
                  label: 'Edit Profile',
                  subtitle: 'Update your name, email, and role details',
                  onTap: _editProfile,
                ),
                const Divider(height: 1, indent: 56),
                _settingsTile(
                  icon: Icons.lock_outline_rounded,
                  label: 'Change Password',
                  subtitle: 'Update your login password',
                  onTap: _changePassword,
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // ── Danger Zone ──────────────────────────────────────────────
          const Text(
            'Danger Zone',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: Colors.red,
            ),
          ),
          const SizedBox(height: 10),
          Container(
            decoration: BoxDecoration(
              color: Colors.red.withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.red.withValues(alpha: 0.25)),
            ),
            child: Column(
              children: [
                _settingsTile(
                  icon: Icons.logout_rounded,
                  label: 'Sign Out',
                  subtitle: 'Log out of your account',
                  onTap: _signOut,
                  danger: true,
                ),
                Divider(height: 1, indent: 56, color: Colors.red.withValues(alpha: 0.15)),
                _settingsTile(
                  icon: Icons.delete_forever_rounded,
                  label: 'Delete Account',
                  subtitle: 'Permanently delete your account',
                  onTap: _deleteAccount,
                  danger: true,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  Widget _avatar(String? pictureUrl) {
    final initials = _initials();
    final resolvedUrl = _resolvePictureUrl(pictureUrl);

    return GestureDetector(
      onTap: _changePicture,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          CircleAvatar(
            radius: 34,
            backgroundColor: const Color(0xFF6988FF),
            backgroundImage:
                resolvedUrl != null ? NetworkImage(resolvedUrl) : null,
            onBackgroundImageError:
                resolvedUrl != null ? (_, _) {} : null,
            child: resolvedUrl == null
                ? Text(
                    initials,
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 18),
                  )
                : null,
          ),
          if (_uploadingPicture)
            Positioned.fill(
              child: CircleAvatar(
                radius: 34,
                backgroundColor: Colors.black.withValues(alpha: 0.45),
                child: const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          Positioned(
            right: -2,
            bottom: -2,
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFF355CFF), width: 1.5),
              ),
              child: const Icon(Icons.camera_alt_rounded,
                  size: 13, color: Color(0xFF355CFF)),
            ),
          ),
        ],
      ),
    );
  }

  /// Backend stores picture paths as `/uploads/<filename>` (relative) — this
  /// prefixes them with the API base URL so NetworkImage can load them.
  String? _resolvePictureUrl(String? pictureUrl) {
    if (pictureUrl == null || pictureUrl.trim().isEmpty) return null;
    if (pictureUrl.startsWith('http')) return pictureUrl;
    return '${UserSession.baseUrl}$pictureUrl';
  }

  Widget _chip(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.20),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white38),
      ),
      child: Text(label,
          style: const TextStyle(
              color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }

  Widget _settingsTile({
    required IconData icon,
    required String label,
    required String subtitle,
    required VoidCallback onTap,
    bool danger = false,
  }) {
    final color = danger ? Colors.red : const Color(0xFF0F172A);
    final subColor = danger ? Colors.red.shade300 : const Color(0xFF64748B);
    return ListTile(
      leading: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: danger
              ? Colors.red.withValues(alpha: 0.08)
              : const Color(0xFFEFF6FF),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, size: 18, color: danger ? Colors.red : _blue),
      ),
      title: Text(label,
          style: TextStyle(
              fontWeight: FontWeight.w600, fontSize: 14, color: color)),
      subtitle: Text(subtitle,
          style: TextStyle(fontSize: 12, color: subColor)),
      trailing: Icon(Icons.chevron_right_rounded,
          size: 18, color: const Color(0xFFCBD5E1)),
      onTap: onTap,
    );
  }

  String _initials() {
    final u = UserSession.current;
    if (u == null) return 'U';
    final a = u.firstName.trim().isNotEmpty ? u.firstName.trim()[0] : '';
    final b = u.lastName.trim().isNotEmpty ? u.lastName.trim()[0] : '';
    final result = (a + b).toUpperCase();
    return result.isEmpty ? 'U' : result;
  }

  TextField _field(TextEditingController ctrl, String label,
      {bool obscureText = false}) {
    return TextField(
      controller: ctrl,
      obscureText: obscureText,
      decoration: _inputDecoration(label),
    );
  }

  static InputDecoration _inputDecoration(String label) {
    return InputDecoration(
      labelText: label,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    );
  }
}
