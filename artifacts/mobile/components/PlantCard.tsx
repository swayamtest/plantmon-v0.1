import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { Plant, getDaysUntilWatering, needsWatering } from "@/types/plant";
import { useWaterPlant } from "@/hooks/usePlants";

interface PlantCardProps {
  plant: Plant;
}

export function PlantCard({ plant }: PlantCardProps) {
  const colors = useColors();
  const router = useRouter();
  const waterPlant = useWaterPlant();
  const daysLeft = getDaysUntilWatering(plant);
  const urgent = needsWatering(plant);

  const handleWater = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    waterPlant.mutate(plant.id);
  };

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: urgent ? colors.accent : colors.border,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    iconContainer: {
      width: 52,
      height: 52,
      borderRadius: 14,
      backgroundColor: urgent ? colors.accent + "22" : colors.secondary,
      alignItems: "center",
      justifyContent: "center",
    },
    content: {
      flex: 1,
    },
    name: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      marginBottom: 2,
    },
    species: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginBottom: 6,
    },
    waterBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: urgent ? colors.accent + "22" : colors.muted,
      alignSelf: "flex-start",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 20,
    },
    waterText: {
      fontSize: 12,
      color: urgent ? colors.accent : colors.mutedForeground,
      fontFamily: "Inter_500Medium",
    },
    waterButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    location: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
  });

  return (
    <Pressable
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
      onPress={() => router.push(`/plant/${plant.id}`)}
    >
      <View style={styles.iconContainer}>
        <Feather
          name="sun"
          size={24}
          color={urgent ? colors.accent : colors.primary}
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.name}>{plant.display_name}</Text>
        {plant.species_name ? (
          <Text style={styles.species}>{plant.species_name}</Text>
        ) : null}
        <View style={styles.waterBadge}>
          <Feather
            name="droplet"
            size={11}
            color={urgent ? colors.accent : colors.mutedForeground}
          />
          <Text style={styles.waterText}>
            {urgent
              ? "Water today"
              : daysLeft === 1
                ? "Water tomorrow"
                : daysLeft > 1
                  ? `Water in ${daysLeft}d`
                  : "Log watering"}
          </Text>
        </View>
        {plant.room_location ? (
          <Text style={[styles.location, { marginTop: 4 }]}>
            {plant.room_location}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.waterButton}
        onPress={handleWater}
        disabled={waterPlant.isPending}
        activeOpacity={0.75}
      >
        <Feather name="droplet" size={18} color={colors.primaryForeground} />
      </TouchableOpacity>
    </Pressable>
  );
}
