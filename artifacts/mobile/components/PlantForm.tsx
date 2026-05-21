import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { Plant, PlantInput } from "@/types/plant";

interface PlantFormProps {
  initialValues?: Partial<Plant>;
  onSubmit: (input: PlantInput) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
  loading?: boolean;
}

export function PlantForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = "Save",
  loading = false,
}: PlantFormProps) {
  const colors = useColors();

  const [name, setName] = useState(initialValues?.name ?? "");
  const [species, setSpecies] = useState(initialValues?.species ?? "");
  const [description, setDescription] = useState(
    initialValues?.description ?? "",
  );
  const [location, setLocation] = useState(initialValues?.location ?? "");
  const [wateringDays, setWateringDays] = useState(
    String(initialValues?.watering_interval_days ?? 7),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name is required";
    const days = parseInt(wateringDays);
    if (isNaN(days) || days < 1 || days > 365)
      e.wateringDays = "Enter a number between 1 and 365";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await onSubmit({
      name: name.trim(),
      species: species.trim() || undefined,
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      watering_interval_days: parseInt(wateringDays),
    });
  };

  const s = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 40 },
    label: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginBottom: 6,
      marginTop: 16,
    },
    input: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius - 2,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    inputError: {
      borderColor: colors.destructive,
    },
    errorText: {
      fontSize: 12,
      color: colors.destructive,
      fontFamily: "Inter_400Regular",
      marginTop: 4,
    },
    textarea: {
      height: 80,
      textAlignVertical: "top",
    },
    rowLabel: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 16,
      marginBottom: 6,
    },
    wateringRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    wateringInput: {
      width: 80,
    },
    wateringUnit: {
      fontSize: 15,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    buttonRow: {
      flexDirection: "row",
      gap: 12,
      marginTop: 32,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    cancelText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    submitButton: {
      flex: 2,
      paddingVertical: 14,
      borderRadius: colors.radius,
      backgroundColor: colors.primary,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    submitText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
  });

  return (
    <View style={s.container}>
      <ScrollView
        style={s.container}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.label}>PLANT NAME *</Text>
        <TextInput
          style={[s.input, errors.name ? s.inputError : null]}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Monstera"
          placeholderTextColor={colors.mutedForeground}
          autoFocus
          returnKeyType="next"
        />
        {errors.name ? <Text style={s.errorText}>{errors.name}</Text> : null}

        <Text style={s.label}>SPECIES</Text>
        <TextInput
          style={s.input}
          value={species}
          onChangeText={setSpecies}
          placeholder="e.g. Monstera deliciosa"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="next"
        />

        <Text style={s.label}>LOCATION</Text>
        <TextInput
          style={s.input}
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. Living room, balcony"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="next"
        />

        <View style={s.rowLabel}>
          <Feather name="droplet" size={13} color={colors.mutedForeground} />
          <Text style={s.label}>WATERING EVERY *</Text>
        </View>
        <View style={s.wateringRow}>
          <TextInput
            style={[
              s.input,
              s.wateringInput,
              errors.wateringDays ? s.inputError : null,
            ]}
            value={wateringDays}
            onChangeText={setWateringDays}
            keyboardType="number-pad"
            returnKeyType="done"
          />
          <Text style={s.wateringUnit}>days</Text>
        </View>
        {errors.wateringDays ? (
          <Text style={s.errorText}>{errors.wateringDays}</Text>
        ) : null}

        <Text style={s.label}>NOTES</Text>
        <TextInput
          style={[s.input, s.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Care notes, sunlight, soil type…"
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={3}
        />

        <View style={s.buttonRow}>
          <TouchableOpacity style={s.cancelButton} onPress={onCancel}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.submitButton}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <>
                <Feather
                  name="check"
                  size={16}
                  color={colors.primaryForeground}
                />
                <Text style={s.submitText}>{submitLabel}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
