import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";

export default function SignUpScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password || !confirm) {
      setError("Please fill in all fields");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    setError("");
    const { error: err } = await signUp(email, password);
    setLoading(false);
    if (err) {
      setError(err.message ?? "Sign up failed");
    } else {
      setDone(true);
    }
  };

  const s = StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1, justifyContent: "center" },
    container: {
      paddingHorizontal: 28,
      paddingTop: insets.top + 40,
      paddingBottom: insets.bottom + 40,
    },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: 22,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 28,
    },
    heading: {
      fontSize: 30,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 6,
    },
    sub: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 36,
    },
    label: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginBottom: 6,
      letterSpacing: 0.5,
    },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      marginBottom: 16,
      paddingHorizontal: 14,
    },
    input: {
      flex: 1,
      paddingVertical: 14,
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    error: {
      color: colors.destructive,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      marginBottom: 16,
      textAlign: "center",
    },
    button: {
      backgroundColor: colors.accent,
      borderRadius: colors.radius,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 4,
    },
    buttonText: {
      color: colors.accentForeground,
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
    },
    footer: {
      flexDirection: "row",
      justifyContent: "center",
      marginTop: 24,
      gap: 4,
    },
    footerText: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
    },
    footerLink: {
      color: colors.primary,
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
    doneBox: {
      alignItems: "center",
      gap: 16,
      paddingVertical: 40,
    },
    doneIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.accent + "22",
      alignItems: "center",
      justifyContent: "center",
    },
    doneTitle: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "center",
    },
    doneText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      paddingHorizontal: 16,
    },
  });

  if (done) {
    return (
      <View style={[s.flex, { justifyContent: "center", alignItems: "center" }]}>
        <View style={s.doneBox}>
          <View style={s.doneIcon}>
            <Feather name="check" size={36} color={colors.accent} />
          </View>
          <Text style={s.doneTitle}>Check your email</Text>
          <Text style={s.doneText}>
            We've sent a confirmation link to {email}. Confirm your account then
            sign in.
          </Text>
          <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
            <Text style={s.footerLink}>Go to Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.container}>
          <View style={s.iconWrap}>
            <Feather name="feather" size={34} color={colors.accentForeground} />
          </View>
          <Text style={s.heading}>Create account</Text>
          <Text style={s.sub}>Start growing your garden</Text>

          <Text style={s.label}>EMAIL</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <Text style={s.label}>PASSWORD</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Min. 6 characters"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
            />
          </View>

          <Text style={s.label}>CONFIRM PASSWORD</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Repeat password"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
            />
          </View>

          {error ? <Text style={s.error}>{error}</Text> : null}

          <TouchableOpacity
            style={s.button}
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.accentForeground} />
            ) : (
              <Text style={s.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <View style={s.footer}>
            <Text style={s.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
              <Text style={s.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
