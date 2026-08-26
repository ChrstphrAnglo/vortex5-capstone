import 'package:flutter/material.dart';
import '../models/user_session.dart';
import 'login_page.dart';

class VerifyCodePage extends StatefulWidget {
  final String firstName;
  final String lastName;
  final String email;
  final String password;
  final String teacherId;
  final String department;
  final String staffType;

  const VerifyCodePage({
    super.key,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.password,
    required this.teacherId,
    required this.department,
    required this.staffType,
  });

  @override
  State<VerifyCodePage> createState() => _VerifyCodePageState();
}

class _VerifyCodePageState extends State<VerifyCodePage> {
  final _codeCtrl = TextEditingController();
  bool _verifying = false;
  bool _resending = false;

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final code = _codeCtrl.text.trim();

    if (!RegExp(r'^\d{6}$').hasMatch(code)) {
      _showMessage("Enter the 6-digit code sent to your email.");
      return;
    }

    setState(() => _verifying = true);

    final err = await UserSession.register(
      firstName: widget.firstName,
      lastName: widget.lastName,
      email: widget.email,
      password: widget.password,
      teacherId: widget.teacherId,
      department: widget.department,
      staffType: widget.staffType,
      code: code,
    );

    if (!mounted) return;

    setState(() => _verifying = false);

    if (err != null) {
      _showMessage(err);
      return;
    }

    _showMessage(
      "Account created. Please wait for admin approval before logging in.",
    );

    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (_) => LoginPage(prefillEmail: widget.email),
      ),
      (route) => false,
    );
  }

  Future<void> _resendCode() async {
    setState(() => _resending = true);

    final err = await UserSession.sendSignupCode(widget.email);

    if (!mounted) return;

    setState(() => _resending = false);

    _showMessage(err ?? "Verification code resent to ${widget.email}");
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4FAF6),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded,
              color: Color(0xFF1E5BFF)),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x140F172A),
                      blurRadius: 28,
                      offset: Offset(0, 16),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(16),
                          child: Image.asset(
                            'assets/images/bewair_logo_black.png',
                            width: 62,
                            height: 62,
                            fit: BoxFit.contain,
                          ),
                        ),
                        const SizedBox(width: 14),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Verify your email',
                                style: TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFF111827),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      "We sent a 6-digit code to ${widget.email}. "
                      "Enter it below to finish creating your account.",
                      style: const TextStyle(color: Color(0xFF64748B)),
                    ),
                    const SizedBox(height: 24),
                    _label("Verification Code"),
                    TextField(
                      controller: _codeCtrl,
                      keyboardType: TextInputType.number,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 6,
                      ),
                      decoration: _fieldDeco(hint: '000000'),
                    ),
                    const SizedBox(height: 12),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: _resending ? null : _resendCode,
                        child: _resending
                            ? const SizedBox(
                                height: 16,
                                width: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Color(0xFF1E88FF),
                                ),
                              )
                            : const Text('Resend code'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 54,
                      child: ElevatedButton(
                        onPressed: _verifying ? null : _verify,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1E88FF),
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        child: _verifying
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text(
                                "Verify & Create Account",
                                style: TextStyle(fontWeight: FontWeight.w700),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  static Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      text,
      style: const TextStyle(
        fontWeight: FontWeight.w600,
        color: Color(0xFF111827),
      ),
    ),
  );

  static InputDecoration _fieldDeco({String? hint}) {
    return InputDecoration(
      hintText: hint,
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
