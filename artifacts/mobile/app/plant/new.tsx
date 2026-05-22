import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { PlantForm } from "@/components/PlantForm";
import { useCreatePlant } from "@/hooks/usePlants";
import { PlantInput } from "@/types/plant";

export default function NewPlantScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const createPlant = useCreatePlant();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleSubmit = async (input: PlantInput) => {
    setSubmitError(null);
    try {
      await createPlant.mutateAsync(input);
      router.back();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as Record<string, unknown>).message)
            : "Failed to save plant";
      setSubmitError(msg);
    }
  };

  const s = StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.destructive + "18",
      borderBottomWidth: 1,
      borderBottomColor: colors.destructive + "44",
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    errorText: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
    },
  });

  return (
    <View style={s.flex}>
      <View style={s.header}>
        <TouchableOpacity style={s.backButton} onPress={() => router.back()}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.title}>New Plant</Text>
      </View>
      {submitError ? (
        <View style={s.errorBanner}>
          <Feather name="alert-circle" size={15} color={colors.destructive} />
          <Text style={s.errorText}>{submitError}</Text>
        </View>
      ) : null}
      <PlantForm
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
        submitLabel="Add Plant"
        loading={createPlant.isPending}
      />
    </View>
  );
}
