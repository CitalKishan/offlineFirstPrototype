import React from 'react';
import { View, Image, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { ThemeColors } from '../utils/theme';

interface ImageGridProps {
  images: any[];
  currentTheme: ThemeColors;
  onImagePress: (image: any) => void;
  onDeleteImage: (index: number) => void;
}

export const ImageGrid: React.FC<ImageGridProps> = ({
  images,
  currentTheme,
  onImagePress,
  onDeleteImage,
}) => {
  return (
    <View style={styles.grid}>
      {images.map((image, index) => (
        <TouchableOpacity
          key={image.uri}
          style={[styles.imageContainer, { backgroundColor: currentTheme.surface }]}
          onPress={() => onImagePress(image)}
        >
          <Image source={{ uri: image.uri }} style={styles.image} />
          {image.uploadStatus === "uploading" && (
            <View style={[styles.overlay, { backgroundColor: currentTheme.overlay }]}>
              <ActivityIndicator color={currentTheme.primary} />
            </View>
          )}
          {image.uploadStatus === "error" && (
            <View style={[styles.errorBadge, { backgroundColor: currentTheme.error }]}>
              <Text style={styles.errorText}>!</Text>
            </View>
          )}
          {image.uploadStatus === "pending" && (
            <View style={[styles.pendingBadge, { backgroundColor: currentTheme.pending }]}>
              <Text style={styles.pendingText}>⌛</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: currentTheme.error }]}
            onPress={() => onDeleteImage(index)}
          >
            <Text style={styles.deleteButtonText}>×</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 4,
  },
  imageContainer: {
    width: '33.33%',
    aspectRatio: 1,
    padding: 4,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  errorBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'white',
    fontWeight: 'bold',
  },
  pendingBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingText: {
    color: 'white',
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
