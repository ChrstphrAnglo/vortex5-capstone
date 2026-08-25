import 'dart:convert';
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiUser {
  final String email;
  final String firstName;
  final String lastName;
  final String teacherId;
  final String department;
  final String staffType;
  final String pictureUrl;
  final String role;
  final String token;

  ApiUser({
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.teacherId,
    required this.department,
    required this.staffType,
    required this.pictureUrl,
    required this.role,
    required this.token,
  });

  factory ApiUser.fromJson(Map<String, dynamic> json) {
    return ApiUser(
      email: json['email']?.toString() ?? '',
      firstName: json['firstName']?.toString() ?? '',
      lastName: json['lastName']?.toString() ?? '',
      teacherId: json['teacherId']?.toString() ?? '',
      department: json['department']?.toString() ?? '',
      staffType: json['staffType']?.toString() ?? '',
      pictureUrl: json['pictureUrl']?.toString() ?? '',
      role: json['role']?.toString() ?? '',
      token: json['token']?.toString() ?? '',
    );
  }

  ApiUser copyWith({
    String? email,
    String? firstName,
    String? lastName,
    String? teacherId,
    String? department,
    String? staffType,
    String? pictureUrl,
    String? role,
    String? token,
  }) {
    return ApiUser(
      email: email ?? this.email,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      teacherId: teacherId ?? this.teacherId,
      department: department ?? this.department,
      staffType: staffType ?? this.staffType,
      pictureUrl: pictureUrl ?? this.pictureUrl,
      role: role ?? this.role,
      token: token ?? this.token,
    );
  }
}

class UserSession {
  static ApiUser? current;

  // ===========================
  // AUTO-DETECT API BASE URL
  // ===========================
  static String get baseUrl {
    return "https://vortex5-capstone.onrender.com";
  }

  static const String userBasePath = "/api/user";

  // ===========================
  // PERSIST LOGIN
  // ===========================
  static Future<void> loadFromStorage() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    final email = prefs.getString('email');
    final firstName = prefs.getString('firstName');
    final lastName = prefs.getString('lastName');
    final teacherId = prefs.getString('teacherId');
    final department = prefs.getString('department');
    final staffType = prefs.getString('staffType');
    final pictureUrl = prefs.getString('pictureUrl') ?? '';
    final role = prefs.getString('role');

    if (token != null &&
        email != null &&
        firstName != null &&
        lastName != null &&
        teacherId != null &&
        department != null &&
        staffType != null &&
        role != null) {
      current = ApiUser(
        email: email,
        firstName: firstName,
        lastName: lastName,
        teacherId: teacherId,
        department: department,
        staffType: staffType,
        pictureUrl: pictureUrl,
        role: role,
        token: token,
      );
    }
  }

  static Future<void> _save(ApiUser u) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('token', u.token);
    await prefs.setString('email', u.email);
    await prefs.setString('firstName', u.firstName);
    await prefs.setString('lastName', u.lastName);
    await prefs.setString('teacherId', u.teacherId);
    await prefs.setString('department', u.department);
    await prefs.setString('staffType', u.staffType);
    await prefs.setString('pictureUrl', u.pictureUrl);
    await prefs.setString('role', u.role);
  }

  static Future<void> logout() async {
    current = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
  }

  static Future<String?> updateProfile({
    required String firstName,
    required String lastName,
    required String email,
    required String department,
    required String staffType,
    required String pictureUrl,
  }) async {
    if (current == null) return "Not logged in.";
    if (firstName.trim().isEmpty ||
        lastName.trim().isEmpty ||
        email.trim().isEmpty) {
      return "Name and email are required.";
    }

    current = current!.copyWith(
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      department: department.trim(),
      staffType: staffType.trim(),
      pictureUrl: pictureUrl.trim(),
    );
    await _save(current!);
    return null;
  }

  static Future<String?> changePassword({
    required String currentPassword,
    required String newPassword,
    required String confirmPassword,
  }) async {
    if (current == null) return "Not logged in.";
    if (currentPassword.trim().isEmpty ||
        newPassword.trim().isEmpty ||
        confirmPassword.trim().isEmpty) {
      return "Please complete all password fields.";
    }
    if (newPassword != confirmPassword) {
      return "New passwords do not match.";
    }
    final passErr = validateStrongPassword(newPassword);
    if (passErr != null) return passErr;
    return null;
  }

  // ===========================
  // PASSWORD VALIDATION
  // ===========================
  static String? validateStrongPassword(String password) {
    final p = password.trim();
    if (p.length < 8) return "Password must be at least 8 characters.";
    if (!RegExp(r'[A-Z]').hasMatch(p)) {
      return "Password must contain an uppercase letter.";
    }
    if (!RegExp(r'[a-z]').hasMatch(p)) {
      return "Password must contain a lowercase letter.";
    }
    if (!RegExp(r'\d').hasMatch(p)) {
      return "Password must contain a number.";
    }
    if (!RegExp(r'[!@#$%^&*(),.?":{}|<>_\-+=/\\\[\]~`]').hasMatch(p)) {
      return "Password must contain a symbol.";
    }
    return null;
  }

  // ===========================
  // SEND SIGNUP VERIFICATION CODE
  // ===========================
  static Future<String?> sendSignupCode(String email) async {
    final uri = Uri.parse("$baseUrl$userBasePath/signup/send-code");

    try {
      final res = await http
          .post(
            uri,
            headers: {"Content-Type": "application/json"},
            body: jsonEncode({"email": email.trim()}),
          )
          .timeout(const Duration(seconds: 30));

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return null;
      }

      return data["error"]?.toString() ?? "Failed to send verification code.";
    } catch (e) {
      return "Connection error: $e";
    }
  }

  // ===========================
  // REGISTER
  // ===========================
  static Future<String?> register({
    required String firstName,
    required String lastName,
    required String email,
    required String password,
    required String teacherId,
    required String department,
    required String staffType,
    required String code,
  }) async {
    final passErr = validateStrongPassword(password);
    if (passErr != null) return passErr;

    if (teacherId.trim().isEmpty) {
      return "Teacher ID is required.";
    }

    if (department.trim().isEmpty) {
      return "Department is required.";
    }

    if (staffType.trim().isEmpty) {
      return "Staff type is required.";
    }

    if (!RegExp(r'^\d{6}$').hasMatch(code.trim())) {
      return "Verification code must be a 6-digit code.";
    }

    final uri = Uri.parse("$baseUrl$userBasePath/signup");

    try {
      final res = await http
          .post(
            uri,
            headers: {"Content-Type": "application/json"},
            body: jsonEncode({
              "firstName": firstName.trim(),
              "lastName": lastName.trim(),
              "email": email.trim(),
              "password": password,
              "teacherId": teacherId.trim(),
              "department": department.trim(),
              "staffType": staffType.trim(),
              "code": code.trim(),
            }),
          )
          .timeout(const Duration(seconds: 60));

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return null;
      }

      return data["error"]?.toString() ?? "Registration failed.";
    } catch (e) {
      return "Connection error: $e";
    }
  }

  // ===========================
  // LOGIN
  // ===========================
  static Future<String?> login({
    required String email,
    required String password,
  }) async {
    final uri = Uri.parse("$baseUrl$userBasePath/login");

    try {
      final res = await http
          .post(
            uri,
            headers: {"Content-Type": "application/json"},
            body: jsonEncode({"email": email.trim(), "password": password}),
          )
          .timeout(const Duration(seconds: 60));

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        final u = ApiUser.fromJson(data);
        current = u;
        await _save(u);
        return null;
      }

      return data["error"]?.toString() ?? "Invalid credentials.";
    } catch (e) {
      return "Connection error: $e";
    }
  }

  // ===========================
  // ADMIN: FETCH USERS
  // ===========================
  static Future<List<Map<String, dynamic>>> fetchAllUsers() async {
    final u = current;
    if (u == null) throw Exception("Not logged in.");

    final uri = Uri.parse("$baseUrl$userBasePath/");

    final res = await http
        .get(
          uri,
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer ${u.token}",
          },
        )
        .timeout(const Duration(seconds: 8));

    final data = _safeJson(res.body);

    if (res.statusCode >= 200 && res.statusCode < 300 && data is List) {
      return data.cast<Map<String, dynamic>>();
    }

    throw Exception("Failed to load users.");
  }

  static dynamic _safeJson(String body) {
    try {
      return jsonDecode(body);
    } catch (_) {
      return {};
    }
  }
}
