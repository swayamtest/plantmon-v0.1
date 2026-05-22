import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
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

  const [displayName, setDisplayName] = useState(
    initialValues?.display_name ?? "",
  );
  const [speciesName, setSpeciesName] = useState(
    initialValues?.species_name ?? "",
  );
  const [roomLocation, setRoomLocation] = useState(
    initialValues?.room_location ?? "",
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!displayName.trim()) e.displayName = "Plant name is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await onSubmit({
      display_name: displayName.trim(),
      species_name: speciesName.trim() || undefined,
      room_location: roomLocation.trim() || undefined,
      notes: notes.trim() || undefined,
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
    required: {
      color: colors.accent,
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
      height: 88,
      textAlignVertical: "top",
    },
    hint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 20,
      textAlign: "center",
      opacity: 0.7,
    },
    buttonRow: {
      flexDirection: "row",
      gap: 12,
      marginTop: 28,
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
        <Text style={s.label}>
          PLANT NAME <Text style={s.required}>*</Text>
        </Text>
        <TextInput
          style={[s.input, errors.displayName ? s.inputError : null]}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="e.g. Monstera, My favourite cactus…"
          placeholderTextColor={colors.mutedForeground}
          autoFocus
          returnKeyType="next"
        />
        {errors.displayName ? (
          <Text style={s.errorText}>{errors.displayName}</Text>
        ) : null}

        <Text style={s.label}>SPECIES</Text>
        <TextInput
          style={s.input}
          value={speciesName}
          onChangeText={setSpeciesName}
          placeholder="e.g. Monstera deliciosa"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="next"
        />

        <Text style={s.label}>LOCATION</Text>
        <TextInput
          style={s.input}
          value={roomLocation}
          onChangeText={setRoomLocation}
          placeholder="e.g. Living room, balcony"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="next"
        />

        <Text style={s.label}>NOTES</Text>
        <TextInput
          style={[s.input, s.textarea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Care notes, sunlight, soil…"
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={3}
        />

        <Text style={s.hint}>
          <Feather name="info" size={11} /> Only a name is required — add more
          detail any time.
        </Text>

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
                <Feather name="check" size={16} color={colors.primaryForeground} />
                <Text style={s.submitText}>{submitLabel}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
