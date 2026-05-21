import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { Plant, getDaysUntilWatering, needsWatering } from "@/types/plant";

interface WateringStatusProps {
  plants: Plant[];
}

export function WateringStatus({ plants }: WateringStatusProps) {
  const colors = useColors();
  const urgentCount = plants.filter(needsWatering).length;
  const soonCount = plants.filter((p) => {
    const d = getDaysUntilWatering(p);
    return d > 0 && d <= 2;
  }).length;

  const s = StyleSheet.create({
    row: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 16,
      marginBottom: 20,
    },
    chip: {
      flex: 1,
      borderRadius: colors.radius,
      padding: 14,
      gap: 4,
    },
    urgentChip: {
      backgroundColor: colors.accent + "22",
      borderWidth: 1,
      borderColor: colors.accent + "44",
    },
    soonChip: {
      backgroundColor: colors.primary + "18",
      borderWidth: 1,
      borderColor: colors.primary + "33",
    },
    okChip: {
      backgroundColor: colors.muted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    count: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
    },
    urgentCount: { color: colors.accent },
    soonCount: { color: colors.primary },
    okCount: { color: colors.mutedForeground },
    label: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
  });

  const okCount = plants.length - urgentCount - soonCount;

  return (
    <View style={s.row}>
      <View style={[s.chip, s.urgentChip]}>
        <Text style={[s.count, s.urgentCount]}>{urgentCount}</Text>
        <View style={s.labelRow}>
          <Feather name="alert-circle" size={11} color={colors.accent} />
          <Text style={s.label}>Water now</Text>
        </View>
      </View>
      <View style={[s.chip, s.soonChip]}>
        <Text style={[s.count, s.soonCount]}>{soonCount}</Text>
        <View style={s.labelRow}>
          <Feather name="clock" size={11} color={colors.primary} />
          <Text style={s.label}>Due soon</Text>
        </View>
      </View>
      <View style={[s.chip, s.okChip]}>
        <Text style={[s.count, s.okCount]}>{okCount}</Text>
        <View style={s.labelRow}>
          <Feather name="check-circle" size={11} color={colors.mutedForeground} />
          <Text style={s.label}>All good</Text>
        </View>
      </View>
    </View>
  );
}
