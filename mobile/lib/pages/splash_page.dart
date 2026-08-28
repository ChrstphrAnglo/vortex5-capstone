import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:vortex5_application_2/models/user_session.dart';
import 'package:vortex5_application_2/pages/main_shell.dart';
import 'package:vortex5_application_2/pages/welcome_page.dart';

class SplashPage extends StatefulWidget {
  const SplashPage({super.key});

  @override
  State<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends State<SplashPage>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _fade;

  @override
  void initState() {
    super.initState();

    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    _fade = CurvedAnimation(parent: _ctrl, curve: Curves.easeIn);
    _ctrl.forward();

    _bootstrap();
  }

  Future<void> _bootstrap() async {
    // Run load + minimum display time in parallel. If reading the stored
    // session throws (rare platform-channel hiccup), don't let the splash
    // screen hang forever with no way forward — fall back to treating it
    // like there's no session, same as a logged-out user.
    try {
      await Future.wait([
        UserSession.loadFromStorage(),
        Future.delayed(const Duration(milliseconds: 1500)),
      ]);
    } catch (e) {
      debugPrint('SplashPage: loadFromStorage failed, defaulting to logged-out: $e');
    }
    if (!mounted) return;

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => UserSession.current != null
            ? const MainShell()
            : const WelcomePage(),
      ),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: FadeTransition(
        opacity: _fade,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Image.asset(
                'assets/images/bewair_logo_black.png',
                width: 100,
                height: 100,
                fit: BoxFit.contain,
              ),
              const SizedBox(height: 20),
              Text(
                'BewAir',
                style: GoogleFonts.poppins(
                  fontSize: 36,
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF18A957),
                  letterSpacing: 1.2,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Indoor Air Quality Monitor',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: const Color(0xFF64748B),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
