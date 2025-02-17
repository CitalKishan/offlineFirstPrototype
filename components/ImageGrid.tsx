import React from "react";
import {
  View,
  Image,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { ThemeColors } from "../utils/theme";

interface ImageGridProps {
  images: any[];
  currentTheme: ThemeColors;
  selectedImages: Set<string>;
  onImagePress: (image: any) => void;
  onLongPress: (image: any) => void;
  onDeleteImage: (index: number) => void;
}

export const ImageGrid: React.FC<ImageGridProps> = ({
  images,
  currentTheme,
  selectedImages,
  onImagePress,
  onLongPress,
  onDeleteImage,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return currentTheme.success;
      case "error":
        return currentTheme.error;
      case "uploading":
        return currentTheme.primary;
      case "pending_deletion":
        return currentTheme.error;
      case "pending":
        return currentTheme.pending;
      default:
        return currentTheme.pending;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return "✓";
      case "error":
        return "❌";
      case "uploading":
        return "↑";
      case "pending_deletion":
        return "🗑️";
      case "pending":
        return "⌛";
      default:
        return "⌛";
    }
  };

  const getStatusText = (image: any) => {
    switch (image.uploadStatus) {
      case "success":
        return `Uploaded\n${new Date(image.uploadDate).toLocaleString()}`;
      case "error":
        return `Error\n${image.uploadError || "Unknown error"}`;
      case "uploading":
        return "Uploading...";
      case "pending_deletion":
        return `Queued for deletion\n${new Date(
          image.deletionQueuedAt
        ).toLocaleString()}`;
      case "pending":
        return "Queued for upload";
      default:
        return "Pending";
    }
  };

  return (
    <View style={styles.grid}>
      {images.map((image, index) => (
        <TouchableOpacity
          key={image.uri}
          style={[
            styles.imageContainer,
            selectedImages.has(image.uri) && styles.selectedImage,
          ]}
          onPress={() => onImagePress(image)}
          onLongPress={() => onLongPress(image)}
        >
          <Image source={{ uri: image.uri }} style={styles.image} />

          {/* Status Overlay */}
          <View
            style={[
              styles.statusOverlay,
              { backgroundColor: `${currentTheme.surface}CC` },
            ]}
          >
            <View
              style={[
                styles.statusIconContainer,
                { backgroundColor: getStatusColor(image.uploadStatus) },
              ]}
            >
              <Text style={styles.statusIcon}>
                {getStatusIcon(image.uploadStatus)}
              </Text>
            </View>
            <Text style={[styles.statusText, { color: currentTheme.text }]}>
              {getStatusText(image)}
            </Text>
          </View>

          {/* Loading Indicator */}
          {image.uploadStatus === "uploading" && (
            <View
              style={[
                styles.loadingOverlay,
                { backgroundColor: `${currentTheme.surface}99` },
              ]}
            >
              <ActivityIndicator size="large" color={currentTheme.primary} />
            </View>
          )}

          {/* Delete Button */}
          <TouchableOpacity
            style={[
              styles.deleteButton,
              { backgroundColor: currentTheme.error },
            ]}
            onPress={() => onDeleteImage(index)}
          >
            <Text style={styles.deleteButtonText}>×</Text>
          </TouchableOpacity>

          {selectedImages.has(image.uri) && (
            <View style={styles.checkmark}>
              <Text style={styles.checkmarkText}>✓</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 4,
  },
  imageContainer: {
    width: "33.33%",
    aspectRatio: 1,
    padding: 4,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },
  statusOverlay: {
    position: "absolute",
    bottom: 4,
    left: 4,
    right: 4,
    padding: 4,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  statusIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  statusIcon: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  statusText: {
    fontSize: 10,
    textAlign: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  deleteButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  selectedImage: {
    borderWidth: 3,
    borderColor: "#2ecc71",
  },
  checkmark: {
    position: "absolute",
    top: 5,
    right: 5,
    backgroundColor: "#2ecc71",
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  checkmarkText: {
    color: "white",
    fontWeight: "bold",
  },
});
