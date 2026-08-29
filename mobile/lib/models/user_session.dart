import 'dart:async' show TimeoutException;
import 'dart:convert';
import 'dart:io' show File, HandshakeException, SocketException;
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show MediaType;
import 'package:mime/mime.dart' show lookupMimeType;
import 'package:shared_preferences/shared_preferences.dart';

class ApiUser {
  final String id;
  final String email;
  final String firstName;
  final String lastName;
  final String teacherId;
  final String department;
  final String staffType;
  final String pictureUrl;
  final String role;
  final String token;
  final String? createdAt;

  ApiUser({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.teacherId,
    required this.department,
    required this.staffType,
    required this.pictureUrl,
    required this.role,
    required this.token,
    this.createdAt,
  });

  factory ApiUser.fromJson(Map<String, dynamic> json) {
    return ApiUser(
      id: json['_id']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      firstName: json['firstName']?.toString() ?? '',
      lastName: json['lastName']?.toString() ?? '',
      teacherId: json['teacherId']?.toString() ?? '',
      department: json['department']?.toString() ?? '',
      staffType: json['staffType']?.toString() ?? '',
      pictureUrl: json['pictureUrl']?.toString() ?? '',
      role: json['role']?.toString() ?? '',
      token: json['token']?.toString() ?? '',
      createdAt: json['createdAt']?.toString(),
    );
  }

  ApiUser copyWith({
    String? id,
    String? email,
    String? firstName,
    String? lastName,
    String? teacherId,
    String? department,
    String? staffType,
    String? pictureUrl,
    String? role,
    String? token,
    String? createdAt,
  }) {
    return ApiUser(
      id: id ?? this.id,
      email: email ?? this.email,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      teacherId: teacherId ?? this.teacherId,
      department: department ?? this.department,
      staffType: staffType ?? this.staffType,
      pictureUrl: pictureUrl ?? this.pictureUrl,
      role: role ?? this.role,
      token: token ?? this.token,
      createdAt: createdAt ?? this.createdAt,
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

  // Two timeout tiers instead of a scattered 8s-60s spread with no reasoning:
  // most calls are ordinary CRUD against an already-warm backend; login,
  // register, and sending the signup code get longer since they can hit a
  // cold-starting free-tier backend and/or trigger a Brevo email round trip.
  static const Duration _standardTimeout = Duration(seconds: 20);
  static const Duration _authTimeout = Duration(seconds: 45);

  // Maps a thrown exception to a plain-language message — never surfaces the
  // raw exception text (e.g. "ClientException with SocketException...") to
  // the user.
  static String _friendlyNetworkError(Object e) {
    if (e is TimeoutException) {
      return "The server took too long to respond. Please try again.";
    }
    if (e is SocketException || e is HandshakeException) {
      return "Can't reach the server. Check your internet connection and try again.";
    }
    if (e is FormatException) {
      return "The server sent back something unexpected. Please try again.";
    }
    return "Something went wrong. Please try again.";
  }

  // ===========================
  // PERSIST LOGIN
  // ===========================
  static Future<void> loadFromStorage() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    final id = prefs.getString('id') ?? '';
    final email = prefs.getString('email');
    final firstName = prefs.getString('firstName');
    final lastName = prefs.getString('lastName');
    final teacherId = prefs.getString('teacherId');
    final department = prefs.getString('department');
    final staffType = prefs.getString('staffType');
    final pictureUrl = prefs.getString('pictureUrl') ?? '';
    final role = prefs.getString('role');
    final createdAt = prefs.getString('createdAt');

    if (token != null &&
        email != null &&
        firstName != null &&
        lastName != null &&
        teacherId != null &&
        department != null &&
        staffType != null &&
        role != null) {
      current = ApiUser(
        id: id,
        email: email,
        firstName: firstName,
        lastName: lastName,
        teacherId: teacherId,
        department: department,
        staffType: staffType,
        pictureUrl: pictureUrl,
        role: role,
        token: token,
        createdAt: createdAt,
      );
    }
  }

  static Future<void> _save(ApiUser u) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('token', u.token);
    await prefs.setString('id', u.id);
    await prefs.setString('email', u.email);
    await prefs.setString('firstName', u.firstName);
    await prefs.setString('lastName', u.lastName);
    await prefs.setString('teacherId', u.teacherId);
    await prefs.setString('department', u.department);
    await prefs.setString('staffType', u.staffType);
    await prefs.setString('pictureUrl', u.pictureUrl);
    await prefs.setString('role', u.role);
    if (u.createdAt != null) {
      await prefs.setString('createdAt', u.createdAt!);
    }
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
  }) async {
    final u = current;
    if (u == null) return "Not logged in.";
    if (firstName.trim().isEmpty ||
        lastName.trim().isEmpty ||
        email.trim().isEmpty) {
      return "Name and email are required.";
    }

    final uri = Uri.parse("$baseUrl$userBasePath/me");

    try {
      final res = await http
          .patch(
            uri,
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer ${u.token}",
            },
            body: jsonEncode({
              "firstName": firstName.trim(),
              "lastName": lastName.trim(),
              "email": email.trim(),
              "department": department.trim(),
              "staffType": staffType.trim(),
            }),
          )
          .timeout(_standardTimeout);

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        // The response is the updated user document — it has no "token"
        // field, so merge onto the existing session rather than replacing
        // it wholesale (which would wipe out the token).
        current = u.copyWith(
          firstName: data['firstName']?.toString(),
          lastName: data['lastName']?.toString(),
          email: data['email']?.toString(),
          department: data['department']?.toString(),
          staffType: data['staffType']?.toString(),
        );
        await _save(current!);
        return null;
      }

      return data["error"]?.toString() ?? "Failed to update profile.";
    } catch (e) {
      return _friendlyNetworkError(e);
    }
  }

  // ===========================
  // UPLOAD PROFILE PICTURE
  // ===========================
  static Future<String?> uploadProfilePicture(File imageFile) async {
    final u = current;
    if (u == null) return "Not logged in.";

    final uri = Uri.parse("$baseUrl$userBasePath/me/picture");

    try {
      // http.MultipartFile.fromPath defaults contentType to
      // application/octet-stream when not given explicitly — it does NOT
      // infer it from the file extension. The backend's upload filter only
      // accepts image/* mimetypes, so without this every picture (no matter
      // the format) was silently rejected. Look the real mimetype up from
      // the file so the server sees e.g. image/jpeg instead.
      final mimeType = lookupMimeType(imageFile.path) ?? 'image/jpeg';

      final request = http.MultipartRequest("PATCH", uri)
        ..headers["Authorization"] = "Bearer ${u.token}"
        ..files.add(await http.MultipartFile.fromPath(
          "picture",
          imageFile.path,
          contentType: MediaType.parse(mimeType),
        ));

      final streamedRes = await request.send().timeout(_standardTimeout);
      final res = await http.Response.fromStream(streamedRes);

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        current = u.copyWith(pictureUrl: data['pictureUrl']?.toString());
        await _save(current!);
        return null;
      }

      return data["error"]?.toString() ?? "Failed to upload picture.";
    } catch (e) {
      return _friendlyNetworkError(e);
    }
  }

  static Future<String?> changePassword({
    required String currentPassword,
    required String newPassword,
    required String confirmPassword,
  }) async {
    final u = current;
    if (u == null) return "Not logged in.";
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

    try {
      final res = await http
          .post(
            Uri.parse("$baseUrl$userBasePath/me/password"),
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer ${u.token}",
            },
            body: jsonEncode({
              "currentPassword": currentPassword,
              "newPassword": newPassword,
            }),
          )
          .timeout(_standardTimeout);

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) return null;

      return data["error"]?.toString() ?? "Failed to update password.";
    } catch (e) {
      return _friendlyNetworkError(e);
    }
  }

  // ===========================
  // DELETE MY ACCOUNT
  // ===========================
  static Future<String?> deleteAccount(String password) async {
    final u = current;
    if (u == null) return "Not logged in.";
    if (password.trim().isEmpty) return "Password is required.";

    final uri = Uri.parse("$baseUrl$userBasePath/me");

    try {
      final res = await http
          .delete(
            uri,
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer ${u.token}",
            },
            body: jsonEncode({"password": password}),
          )
          .timeout(_standardTimeout);

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return null;
      }

      return data["error"]?.toString() ?? "Failed to delete account.";
    } catch (e) {
      return _friendlyNetworkError(e);
    }
  }

  // ===========================
  // FORGOT / RESET PASSWORD
  // ===========================
  static Future<String?> forgotPassword(String email) async {
    final uri = Uri.parse("$baseUrl$userBasePath/forgot-password");

    try {
      final res = await http
          .post(
            uri,
            headers: {"Content-Type": "application/json"},
            body: jsonEncode({"email": email.trim()}),
          )
          .timeout(_standardTimeout);

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return null;
      }

      return data["error"]?.toString() ?? "Failed to send reset code.";
    } catch (e) {
      return _friendlyNetworkError(e);
    }
  }

  static Future<String?> resetPassword({
    required String email,
    required String code,
    required String newPassword,
  }) async {
    final passErr = validateStrongPassword(newPassword);
    if (passErr != null) return passErr;

    final uri = Uri.parse("$baseUrl$userBasePath/reset-password");

    try {
      final res = await http
          .post(
            uri,
            headers: {"Content-Type": "application/json"},
            body: jsonEncode({
              "email": email.trim(),
              "code": code.trim(),
              "newPassword": newPassword,
            }),
          )
          .timeout(_standardTimeout);

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return null;
      }

      return data["error"]?.toString() ?? "Failed to reset password.";
    } catch (e) {
      return _friendlyNetworkError(e);
    }
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
          .timeout(_authTimeout);

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return null;
      }

      return data["error"]?.toString() ?? "Failed to send verification code.";
    } catch (e) {
      return _friendlyNetworkError(e);
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
          .timeout(_authTimeout);

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return null;
      }

      return data["error"]?.toString() ?? "Registration failed.";
    } catch (e) {
      return _friendlyNetworkError(e);
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
          .timeout(_authTimeout);

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        var u = ApiUser.fromJson(data);

        // The login response only includes a handful of fields (no
        // department/staffType/teacherId/pictureUrl/createdAt) — fetch the
        // full profile so nothing gets wiped to empty on a fresh login.
        // Retried a couple of times (a cold-starting backend can be slow to
        // respond right after the login call); non-fatal either way — the
        // user is still logged in with the basic response as a fallback,
        // just with those extra fields blank until the next successful sync.
        for (var attempt = 0; attempt < 3; attempt++) {
          try {
            final profileRes = await http.get(
              Uri.parse("$baseUrl$userBasePath/me"),
              headers: {"Authorization": "Bearer ${u.token}"},
            ).timeout(const Duration(seconds: 15));

            if (profileRes.statusCode >= 200 && profileRes.statusCode < 300) {
              final profileData = _safeJson(profileRes.body);
              u = ApiUser.fromJson(profileData).copyWith(token: u.token);
            } else {
              debugPrint(
                  "UserSession.login: /me returned ${profileRes.statusCode} after login (attempt ${attempt + 1}/3)");
            }
            break;
          } catch (e) {
            debugPrint(
                "UserSession.login: /me fetch failed after login (attempt ${attempt + 1}/3): $e");
            if (attempt < 2) await Future.delayed(const Duration(seconds: 2));
          }
        }

        current = u;
        await _save(u);
        return null;
      }

      return data["error"]?.toString() ?? "Invalid credentials.";
    } catch (e) {
      return _friendlyNetworkError(e);
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
        .timeout(_standardTimeout);

    final data = _safeJson(res.body);

    if (res.statusCode >= 200 && res.statusCode < 300 && data is List) {
      return data.cast<Map<String, dynamic>>();
    }

    throw Exception("Failed to load users.");
  }

  // ===========================
  // ADMIN: USER MANAGEMENT ACTIONS
  // ===========================
  static Future<String?> adminApproveUser(String userId) async {
    final u = current;
    if (u == null) return "Not logged in.";

    try {
      final res = await http
          .patch(
            Uri.parse("$baseUrl$userBasePath/$userId/approve"),
            headers: {"Authorization": "Bearer ${u.token}"},
          )
          .timeout(_standardTimeout);

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) return null;

      return data["error"]?.toString() ?? "Failed to approve user.";
    } catch (e) {
      return _friendlyNetworkError(e);
    }
  }

  static Future<String?> adminUpdateUserRole(String userId, String role) async {
    final u = current;
    if (u == null) return "Not logged in.";

    try {
      final res = await http
          .patch(
            Uri.parse("$baseUrl$userBasePath/$userId"),
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer ${u.token}",
            },
            body: jsonEncode({"role": role}),
          )
          .timeout(_standardTimeout);

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) return null;

      return data["error"]?.toString() ?? "Failed to update role.";
    } catch (e) {
      return _friendlyNetworkError(e);
    }
  }

  static Future<String?> adminDeactivateUser(String userId) async {
    final u = current;
    if (u == null) return "Not logged in.";

    try {
      final res = await http
          .patch(
            Uri.parse("$baseUrl$userBasePath/$userId/deactivate"),
            headers: {"Authorization": "Bearer ${u.token}"},
          )
          .timeout(_standardTimeout);

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) return null;

      return data["error"]?.toString() ?? "Failed to deactivate user.";
    } catch (e) {
      return _friendlyNetworkError(e);
    }
  }

  static Future<String?> adminReactivateUser(String userId) async {
    final u = current;
    if (u == null) return "Not logged in.";

    try {
      final res = await http
          .patch(
            Uri.parse("$baseUrl$userBasePath/$userId/reactivate"),
            headers: {"Authorization": "Bearer ${u.token}"},
          )
          .timeout(_standardTimeout);

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) return null;

      return data["error"]?.toString() ?? "Failed to reactivate user.";
    } catch (e) {
      return _friendlyNetworkError(e);
    }
  }

  static Future<String?> adminDeleteUser(String userId) async {
    final u = current;
    if (u == null) return "Not logged in.";

    try {
      final res = await http
          .delete(
            Uri.parse("$baseUrl$userBasePath/$userId"),
            headers: {"Authorization": "Bearer ${u.token}"},
          )
          .timeout(_standardTimeout);

      final data = _safeJson(res.body);

      if (res.statusCode >= 200 && res.statusCode < 300) return null;

      return data["error"]?.toString() ?? "Failed to delete user.";
    } catch (e) {
      return _friendlyNetworkError(e);
    }
  }

  static dynamic _safeJson(String body) {
    try {
      return jsonDecode(body);
    } catch (_) {
      return {};
    }
  }
}
