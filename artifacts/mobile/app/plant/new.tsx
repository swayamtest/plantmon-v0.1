import React from "react";
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

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleSubmit = async (input: PlantInput) => {
    await createPlant.mutateAsync(input);
    router.back();
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
  });

  return (
    <View style={s.flex}>
      <View style={s.header}>
        <TouchableOpacity style={s.backButton} onPress={() => router.back()}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.title}>New Plant</Text>
      </View>
      <PlantForm
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
        submitLabel="Add Plant"
        loading={createPlant.isPending}
      />
    </View>
  );
}
