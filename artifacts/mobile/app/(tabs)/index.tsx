import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { usePlants } from "@/hooks/usePlants";
import { PlantCard } from "@/components/PlantCard";
import { WateringStatus } from "@/components/WateringStatus";
import { Plant, needsWatering, getDaysUntilWatering } from "@/types/plant";

type FilterType = "all" | "today" | "soon";

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: plants = [], isLoading, refetch, isRefetching } = usePlants();
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered: Plant[] = plants.filter((p) => {
    if (filter === "today") return needsWatering(p);
    if (filter === "soon") {
      const d = getDaysUntilWatering(p);
      return d > 0 && d <= 2;
    }
    return true;
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const s = StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 16,
      paddingHorizontal: 16,
      paddingBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    greeting: {
      fontSize: 26,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    subtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    addButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    filterRow: {
      flexDirection: "row",
      paddingHorizontal: 16,
      gap: 8,
      marginBottom: 16,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    filterChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    filterTextActive: {
      color: colors.primaryForeground,
    },
    emptyWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 60,
      gap: 12,
    },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTitle: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    emptyText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      paddingHorizontal: 32,
    },
    emptyButton: {
      marginTop: 8,
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: colors.radius,
    },
    emptyButtonText: {
      color: colors.primaryForeground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
    },
    listContent: {
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100),
    },
  });

  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "today", label: "Water today" },
    { key: "soon", label: "Due soon" },
  ];

  return (
    <View style={s.flex}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.listContent,
          filtered.length === 0 && { flex: 1 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            <View style={s.header}>
              <View>
                <Text style={s.greeting}>My Garden</Text>
                <Text style={s.subtitle}>
                  {plants.length === 0
                    ? "No plants yet"
                    : `${plants.length} plant${plants.length !== 1 ? "s" : ""}`}
                </Text>
              </View>
              <TouchableOpacity
                style={s.addButton}
                onPress={() => router.push("/plant/new")}
                activeOpacity={0.8}
              >
                <Feather
                  name="plus"
                  size={22}
                  color={colors.primaryForeground}
                />
              </TouchableOpacity>
            </View>

            {plants.length > 0 && <WateringStatus plants={plants} />}

            <View style={s.filterRow}>
              {filters.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[
                    s.filterChip,
                    filter === f.key ? s.filterChipActive : null,
                  ]}
                  onPress={() => setFilter(f.key)}
                >
                  <Text
                    style={[
                      s.filterText,
                      filter === f.key ? s.filterTextActive : null,
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        }
        renderItem={({ item }) => <PlantCard plant={item} />}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={s.emptyWrap}>
              <View style={s.emptyIcon}>
                <Feather name="sun" size={32} color={colors.mutedForeground} />
              </View>
              <Text style={s.emptyTitle}>
                {filter !== "all" ? "Nothing here" : "No plants yet"}
              </Text>
              <Text style={s.emptyText}>
                {filter !== "all"
                  ? "No plants match this filter"
                  : "Add your first plant to get started with your garden."}
              </Text>
              {filter === "all" && (
                <TouchableOpacity
                  style={s.emptyButton}
                  onPress={() => router.push("/plant/new")}
                >
                  <Text style={s.emptyButtonText}>Add plant</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        }
      />
    </View>
  );
}
