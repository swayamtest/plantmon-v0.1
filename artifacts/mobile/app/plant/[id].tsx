import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import {
  usePlant,
  useDeletePlant,
  useWaterPlant,
  useUpdatePlant,
} from "@/hooks/usePlants";
import { PlantForm } from "@/components/PlantForm";
import {
  getWateringTask,
  getDaysUntilWatering,
  needsWatering,
  PlantInput,
} from "@/types/plant";

export default function PlantDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: plant, isLoading } = usePlant(id ?? "");
  const deletePlant = useDeletePlant();
  const waterPlant = useWaterPlant();
  const updatePlant = useUpdatePlant();
  const [editing, setEditing] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const s = StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },
    backButton: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      flex: 1,
    },
    headerActions: {
      flexDirection: "row",
      gap: 4,
    },
    iconBtn: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    heroCard: {
      margin: 16,
      backgroundColor: colors.card,
      borderRadius: colors.radius + 2,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    heroBanner: {
      height: 120,
      backgroundColor: colors.primary + "22",
      alignItems: "center",
      justifyContent: "center",
    },
    heroBody: {
      padding: 16,
    },
    plantName: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 4,
    },
    plantSpecies: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      fontStyle: "italic",
      marginBottom: 12,
    },
    chipRow: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      backgroundColor: colors.muted,
    },
    chipText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    urgentChip: {
      backgroundColor: colors.accent + "22",
    },
    urgentChipText: {
      color: colors.accent,
    },
    waterSection: {
      marginHorizontal: 16,
      marginBottom: 16,
    },
    waterCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    waterInfo: { flex: 1 },
    waterTitle: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 2,
    },
    waterSub: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    waterButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: colors.radius,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    waterButtonText: {
      color: colors.primaryForeground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
    },
    notesSection: {
      marginHorizontal: 16,
      marginBottom: 16,
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    notesCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    notesText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 22,
    },
    deleteSection: {
      marginHorizontal: 16,
      marginBottom: insets.bottom + (Platform.OS === "web" ? 34 : 24),
    },
    deleteButton: {
      borderWidth: 1,
      borderColor: colors.destructive + "55",
      borderRadius: colors.radius,
      paddingVertical: 14,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    deleteText: {
      color: colors.destructive,
      fontFamily: "Inter_500Medium",
      fontSize: 15,
    },
  });

  const handleDelete = () => {
    Alert.alert(
      "Delete plant",
      `Remove "${plant?.display_name}" from your garden?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Warning,
            );
            await deletePlant.mutateAsync(id!);
            router.back();
          },
        },
      ],
    );
  };

  const handleWater = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await waterPlant.mutateAsync(id!);
  };

  const handleUpdate = async (input: PlantInput) => {
    await updatePlant.mutateAsync({ id: id!, ...input });
    setEditing(false);
  };

  if (isLoading || !plant) {
    return (
      <View style={[s.flex, s.loading]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (editing) {
    return (
      <View style={s.flex}>
        <View style={s.header}>
          <View style={s.headerLeft}>
            <TouchableOpacity
              style={s.backButton}
              onPress={() => setEditing(false)}
            >
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Edit Plant</Text>
          </View>
        </View>
        <PlantForm
          initialValues={plant}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
          submitLabel="Save Changes"
          loading={updatePlant.isPending}
        />
      </View>
    );
  }

  const wateringTask = getWateringTask(plant);
  const daysLeft = getDaysUntilWatering(plant);
  const urgent = needsWatering(plant);

  const wateringTitle = urgent
    ? "Needs watering today"
    : daysLeft > 0
      ? `Water in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`
      : "No watering schedule set";

  const wateringSubtitle = wateringTask?.last_completed_at
    ? `Last watered ${new Date(wateringTask.last_completed_at).toLocaleDateString()}`
    : "Never watered";

  return (
    <View style={s.flex}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <TouchableOpacity style={s.backButton} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>
            {plant.display_name}
          </Text>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity style={s.iconBtn} onPress={() => setEditing(true)}>
            <Feather name="edit-2" size={19} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.heroCard}>
          <View style={s.heroBanner}>
            <Feather name="sun" size={56} color={colors.primary} />
          </View>
          <View style={s.heroBody}>
            <Text style={s.plantName}>{plant.display_name}</Text>
            {plant.species_name ? (
              <Text style={s.plantSpecies}>{plant.species_name}</Text>
            ) : null}
            <View style={s.chipRow}>
              {wateringTask && (
                <View style={[s.chip, urgent ? s.urgentChip : null]}>
                  <Feather
                    name="droplet"
                    size={12}
                    color={urgent ? colors.accent : colors.mutedForeground}
                  />
                  <Text style={[s.chipText, urgent ? s.urgentChipText : null]}>
                    {urgent
                      ? "Water now"
                      : daysLeft === 1
                        ? "Tomorrow"
                        : daysLeft > 1
                          ? `${daysLeft}d left`
                          : "Logged"}
                  </Text>
                </View>
              )}
              {plant.room_location ? (
                <View style={s.chip}>
                  <Feather
                    name="map-pin"
                    size={12}
                    color={colors.mutedForeground}
                  />
                  <Text style={s.chipText}>{plant.room_location}</Text>
                </View>
              ) : null}
              {wateringTask?.frequency_days ? (
                <View style={s.chip}>
                  <Feather
                    name="refresh-cw"
                    size={12}
                    color={colors.mutedForeground}
                  />
                  <Text style={s.chipText}>
                    Every {wateringTask.frequency_days}d
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={s.waterSection}>
          <Text style={s.sectionLabel}>WATERING</Text>
          <View style={s.waterCard}>
            <View style={s.waterInfo}>
              <Text style={s.waterTitle}>{wateringTitle}</Text>
              <Text style={s.waterSub}>{wateringSubtitle}</Text>
            </View>
            <TouchableOpacity
              style={s.waterButton}
              onPress={handleWater}
              disabled={waterPlant.isPending}
              activeOpacity={0.8}
            >
              {waterPlant.isPending ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primaryForeground}
                />
              ) : (
                <>
                  <Feather
                    name="droplet"
                    size={15}
                    color={colors.primaryForeground}
                  />
                  <Text style={s.waterButtonText}>Water</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {plant.notes ? (
          <View style={s.notesSection}>
            <Text style={s.sectionLabel}>NOTES</Text>
            <View style={s.notesCard}>
              <Text style={s.notesText}>{plant.notes}</Text>
            </View>
          </View>
        ) : null}

        <View style={s.deleteSection}>
          <TouchableOpacity
            style={s.deleteButton}
            onPress={handleDelete}
            activeOpacity={0.7}
          >
            <Feather name="trash-2" size={16} color={colors.destructive} />
            <Text style={s.deleteText}>Delete plant</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
