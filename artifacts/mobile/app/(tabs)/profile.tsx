import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { usePlants } from "@/hooks/usePlants";
import { needsWatering } from "@/types/plant";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { data: plants = [] } = usePlants();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const s = StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 20,
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    title: {
      fontSize: 26,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    avatarWrap: {
      alignItems: "center",
      paddingVertical: 28,
    },
    avatar: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    avatarText: {
      fontSize: 34,
      fontFamily: "Inter_700Bold",
      color: colors.primaryForeground,
    },
    email: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    emailSub: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    statsRow: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 20,
      marginBottom: 24,
    },
    stat: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    statNum: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
    statLabel: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    section: {
      marginHorizontal: 20,
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    menuCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },
    menuDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: 48,
    },
    menuText: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    menuDestructive: {
      color: colors.destructive,
    },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    iconWrapRed: {
      backgroundColor: colors.destructive + "22",
    },
  });

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "PL";
  const needsWaterCount = plants.filter(needsWatering).length;

  return (
    <View style={s.flex}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>Profile</Text>
        </View>

        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <Text style={s.email}>{user?.email}</Text>
          <Text style={s.emailSub}>Gardener</Text>
        </View>

        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{plants.length}</Text>
            <Text style={s.statLabel}>Plants</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statNum, { color: colors.accent }]}>
              {needsWaterCount}
            </Text>
            <Text style={s.statLabel}>Need water</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>ACCOUNT</Text>
          <View style={s.menuCard}>
            <View style={s.menuItem}>
              <View style={s.iconWrap}>
                <Feather name="mail" size={16} color={colors.mutedForeground} />
              </View>
              <Text style={s.menuText}>{user?.email}</Text>
            </View>
          </View>
        </View>

        <View style={[s.section, { marginBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20) }]}>
          <Text style={s.sectionTitle}>ACTIONS</Text>
          <View style={s.menuCard}>
            <TouchableOpacity style={s.menuItem} onPress={signOut}>
              <View style={[s.iconWrap, s.iconWrapRed]}>
                <Feather name="log-out" size={16} color={colors.destructive} />
              </View>
              <Text style={[s.menuText, s.menuDestructive]}>Sign Out</Text>
              <Feather
                name="chevron-right"
                size={16}
                color={colors.destructive}
              />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
