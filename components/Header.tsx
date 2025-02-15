import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemeColors, ThemeMode } from '../utils/theme';

interface HeaderProps {
  themeMode: ThemeMode;
  currentTheme: ThemeColors;
  onThemeToggle: () => void;
}

export const Header: React.FC<HeaderProps> = ({ themeMode, currentTheme, onThemeToggle }) => {
  return (
    <View style={styles.header}>
      <Text style={[styles.title, { color: currentTheme.text }]}>
        Offline-First Gallery
      </Text>
      <TouchableOpacity
        style={[styles.themeToggle, { backgroundColor: currentTheme.surface }]}
        onPress={onThemeToggle}
      >
        <Text style={[styles.themeToggleText, { color: currentTheme.text }]}>
          {themeMode === "dark" ? "🌙" : "☀️"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
  },
  themeToggle: {
    padding: 8,
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  themeToggleText: {
    fontSize: 18,
  },
});
