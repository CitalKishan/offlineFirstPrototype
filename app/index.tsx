import React, { useState, useEffect } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  StatusBar,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import Constants from "expo-constants";
import NetInfo from "@react-native-community/netinfo";
import { createClient } from "@supabase/supabase-js";
import { configData } from "../config";
import Toast, { BaseToast, ErrorToast } from "react-native-toast-message";
import { theme, ThemeMode } from "../utils/theme";
import { Header } from "../components/Header";
import { ImageGrid } from "../components/ImageGrid";
import { ImageModal } from "../components/ImageModal";
import { ConnectionStatus } from "../components/ConnectionStatus";

const supabase = createClient(
  configData.supabase.url,
  configData.supabase.anonKey
);

interface ImageInfo {
  uri: string;
  uploadStatus:
    | "pending"
    | "uploading"
    | "success"
    | "error"
    | "pending_deletion";
  uploadError: string | null;
  uploadDate: string | null;
  cloudPath?: string;
  deletionQueuedAt?: string;
}

// Add type for toast props
interface ToastProps {
  text1Style: object;
  text2Style: object;
  contentContainerStyle?: object;
  style?: object;
  [key: string]: any;
}

// Update toast config with proper types
const toastConfig = {
  success: (props: ToastProps) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: "#2ecc71" }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{ fontSize: 15, fontWeight: "bold" }}
      text2Style={{ fontSize: 13 }}
    />
  ),
  error: (props: ToastProps) => (
    <ErrorToast
      {...props}
      style={{ borderLeftColor: "#e74c3c" }}
      text1Style={{ fontSize: 15, fontWeight: "bold" }}
      text2Style={{ fontSize: 13 }}
    />
  ),
  info: (props: ToastProps) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: "#3498db" }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{ fontSize: 15, fontWeight: "bold" }}
      text2Style={{ fontSize: 13 }}
    />
  ),
};

// Update the generateImageHash function to handle the new format
const generateImageHash = (uri: string): string => {
  const filename = uri.split("/").pop() || "";
  const baseFilename = filename.split(".")[0];

  // If filename matches our format (timestamp-index)
  if (/^\d+-\d+$/.test(baseFilename)) {
    return baseFilename;
  }

  // For other files (like when first selecting), generate a new timestamp-index
  return `${Date.now()}-0`;
};

export default function App() {
  const [savedImages, setSavedImages] = useState<ImageInfo[]>([]);
  const [saveQueue, setSaveQueue] = useState<ImageInfo[]>([]);
  const [uploadQueue, setUploadQueue] = useState<ImageInfo[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isConnected, setIsConnected] = useState(true);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const currentTheme = theme[themeMode];
  const [processingImages, setProcessingImages] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = Boolean(
        state.isConnected && state.isInternetReachable
      );
      setIsConnected(isConnected);

      if (isConnected) {
        processUploadQueue();
        processQueuedDeletions();
      }
    });

    return () => unsubscribe();
  }, [isConnected]);

  useEffect(() => {
    if (saveQueue.length > 0) {
      processSaveQueue();
    }
  }, [saveQueue.length]);

  useEffect(() => {
    if (isConnected && uploadQueue.length > 0) {
      processUploadQueue();
    }
  }, [uploadQueue.length, isConnected]);

  useEffect(() => {
    loadSavedImages();
  }, []);

  const loadSavedImages = async () => {
    console.log("🔄 Loading saved images...");
    try {
      const saved = await AsyncStorage.getItem("savedImages");
      if (saved) {
        const parsed = JSON.parse(saved);

        // Wait for all file existence checks to complete
        const validImagesPromises = await Promise.all(
          parsed.map(async (img: ImageInfo) => {
            if (!img.uri || typeof img.uri !== "string") {
              return null;
            }

            try {
              const fileInfo = await FileSystem.getInfoAsync(img.uri);
              if (fileInfo.exists) {
                // Keep the existing status - don't modify already uploaded images
                return img;
              }
              return null;
            } catch (error) {
              console.error("Error checking file:", img.uri, error);
              return null;
            }
          })
        );

        const validImages = validImagesPromises.filter(
          (img): img is ImageInfo => img !== null
        );
        console.log(`✅ Loaded ${validImages.length} images successfully`);

        setSavedImages(validImages);

        // Add only pending images to upload queue
        const pendingImages = validImages.filter(
          (img) => img.uploadStatus === "pending"
        );
        if (pendingImages.length > 0) {
          console.log(
            `📤 Adding ${pendingImages.length} pending images to upload queue`
          );
          setUploadQueue((prev) => [...prev, ...pendingImages]);
        }
      } else {
        console.log("No saved images found");
        setSavedImages([]);
      }
    } catch (error) {
      console.error("❌ Error loading images:", error);
      Toast.show({
        type: "error",
        text1: "Error Loading Images",
        text2: "Failed to load saved images",
      });
      setSavedImages([]);
    }
  };

  const pickImage = async () => {
    console.log("📸 Opening image picker...");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsMultipleSelection: true,
        selectionLimit: 10,
        exif: true,
        base64: false,
      });

      if (result.canceled) {
        console.log("❌ Image selection cancelled");
        return;
      }

      console.log(`✨ Step 1: ${result.assets.length} image(s) selected`);

      // Add selected images to save queue
      const newImages: ImageInfo[] = result.assets.map((asset) => ({
        uri: asset.uri,
        uploadStatus: "pending",
        uploadError: null,
        uploadDate: null,
      }));

      console.log("📥 Step 2: Moving images to save queue...");
      setSaveQueue((prev) => [...prev, ...newImages]);
    } catch (error) {
      console.error("❌ Error picking image:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to pick image. Please try again.",
      });
    }
  };

  const processSaveQueue = async () => {
    if (saveQueue.length === 0) return;
    console.log(`📦 Step 3: Processing save queue - ${saveQueue.length} items`);

    try {
      const baseTimestamp = Date.now(); // Use one timestamp as base
      const processedImages = await Promise.all(
        saveQueue.map(async (imageInfo, index) => {
          // Generate a consistent ID based on timestamp and index
          const uniqueId = `${baseTimestamp}-${index}`; // Add index to make it unique
          const newPath = `${FileSystem.documentDirectory}${uniqueId}.jpg`;

          try {
            await FileSystem.copyAsync({
              from: imageInfo.uri,
              to: newPath,
            });
            console.log(`💾 Step 4: Saved image to local storage: ${newPath}`);

            return {
              ...imageInfo,
              uri: newPath,
              uploadStatus: "pending" as const,
            };
          } catch (err) {
            console.error("Failed to copy image:", err);
            return null;
          }
        })
      );

      const validImages = processedImages.filter(
        (img): img is NonNullable<typeof img> => img !== null
      );

      if (validImages.length > 0) {
        console.log(
          `⏳ Step 5: Moving ${validImages.length} images to upload queue`
        );

        // Update states atomically to prevent race conditions
        const newSavedImages = [...savedImages, ...validImages];
        setSavedImages(newSavedImages);
        setUploadQueue((prev) => [...prev, ...validImages]);
        await AsyncStorage.setItem(
          "savedImages",
          JSON.stringify(newSavedImages)
        );
      }

      setSaveQueue([]);
    } catch (error) {
      console.error(
        "❌ Error processing save queue:",
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const uploadImageToCloud = async (
    imageInfo: ImageInfo
  ): Promise<ImageInfo> => {
    console.log(`☁️ Step 6: Starting cloud upload for: ${imageInfo.uri}`);

    if (!isConnected) {
      console.log("📶 No internet connection, marking as pending");
      return {
        ...imageInfo,
        uploadStatus: "pending",
        uploadError: "No internet connection",
      };
    }

    try {
      const fileUri = imageInfo.uri;
      const imageHash = generateImageHash(fileUri);
      const fileName = `${imageHash}.jpg`;
      const fileType = "image/jpeg";

      // Check if file was already uploaded
      const { data: existingFiles } = await supabase.storage
        .from("images")
        .list();

      const alreadyUploaded = existingFiles?.some((file) => {
        const existingHash = generateImageHash(file.name);
        return existingHash === imageHash;
      });

      if (alreadyUploaded) {
        console.log("⚠️ File was already uploaded, skipping...");
        return {
          ...imageInfo,
          uploadStatus: "success",
          uploadDate: new Date().toISOString(),
          cloudPath: fileName,
          uploadError: null,
        };
      }

      // Check if this image is already being processed
      if (processingImages.has(imageHash)) {
        console.log("⚠️ Image is already being processed, skipping...");
        return imageInfo;
      }

      const formData = new FormData();
      formData.append("file", {
        uri: fileUri,
        name: fileName,
        type: fileType,
      } as any);

      const { data, error } = await supabase.storage
        .from("images")
        .upload(fileName, formData, {
          contentType: "multipart/form-data",
          upsert: false, // Prevent overwriting existing files
        });

      if (error) {
        if (error.statusCode === "409") {
          // File already exists, treat as success
          console.log("⚠️ File already exists in storage, treating as success");
          return {
            ...imageInfo,
            uploadStatus: "success",
            uploadDate: new Date().toISOString(),
            cloudPath: fileName,
            uploadError: null,
          };
        }
        throw error;
      }

      console.log(`✅ Step 7: Successfully uploaded to cloud: ${data?.path}`);
      return {
        ...imageInfo,
        uploadStatus: "success",
        uploadDate: new Date().toISOString(),
        cloudPath: data?.path || "",
        uploadError: null,
      };
    } catch (error) {
      console.error("❌ Cloud upload failed:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
          ? (error as { message: string }).message
          : "Upload failed";

      return {
        ...imageInfo,
        uploadStatus: "error",
        uploadError: errorMessage,
      };
    }
  };

  const processUploadQueue = async () => {
    if (!isConnected || uploadQueue.length === 0) return;

    console.log(`🔄 Processing upload queue: ${uploadQueue.length} items`);

    try {
      const currentQueue = [...uploadQueue];
      setUploadQueue([]); // Clear the queue immediately

      // Process images one at a time
      for (const image of currentQueue) {
        const imageHash = generateImageHash(image.uri);

        // Skip if image is already being processed
        if (processingImages.has(imageHash)) {
          console.log(`⏭️ Skipping duplicate upload for: ${image.uri}`);
          continue;
        }

        try {
          // Mark image as being processed using the hash
          setProcessingImages((prev) => new Set(prev).add(imageHash));

          const result = await uploadImageToCloud(image);

          // Update saved images with the result
          setSavedImages((prev) => {
            const newSavedImages = prev.map((img) =>
              img.uri === image.uri ? result : img
            );
            // Save to AsyncStorage immediately after each successful upload
            if (result.uploadStatus === "success") {
              AsyncStorage.setItem(
                "savedImages",
                JSON.stringify(newSavedImages)
              ).catch((err) =>
                console.error("Failed to save upload status:", err)
              );
            }
            return newSavedImages;
          });

          // Remove from processing set
          setProcessingImages((prev) => {
            const newSet = new Set(prev);
            newSet.delete(imageHash);
            return newSet;
          });

          // Only show toast if this was a new upload
          if (
            image.uploadStatus === "pending" &&
            result.uploadStatus === "success"
          ) {
            Toast.show({
              type: "success",
              text1: "Upload Success",
              text2: "Image uploaded successfully",
            });
          } else if (result.uploadStatus === "error") {
            Toast.show({
              type: "error",
              text1: "Upload Failed",
              text2: result.uploadError || "Unknown error occurred",
            });
          }
        } catch (error) {
          console.error("Error uploading image:", error);
          setProcessingImages((prev) => {
            const newSet = new Set(prev);
            newSet.delete(imageHash);
            return newSet;
          });
        }
      }
    } catch (error) {
      console.error(
        "❌ Error processing upload queue:",
        error instanceof Error ? error.message : String(error)
      );
      Toast.show({
        type: "error",
        text1: "Upload Error",
        text2: "Failed to process upload queue",
      });
    }
  };

  const deleteImage = async (index: number) => {
    const imageToDelete = savedImages[index];
    if (!imageToDelete) return;

    console.log("🗑️ Starting delete process for image:", imageToDelete);

    if (!isConnected && imageToDelete.uploadStatus === "success") {
      console.log("📶 Offline detected, queueing for deletion");
      const updatedImages = savedImages.map((img, i) => {
        if (i === index) {
          return {
            ...img,
            uploadStatus: "pending_deletion" as const,
            deletionQueuedAt: new Date().toISOString(),
          };
        }
        return img;
      });

      setSavedImages(updatedImages);
      await AsyncStorage.setItem("savedImages", JSON.stringify(updatedImages));

      console.log("✅ Image queued for deletion");
      Toast.show({
        type: "info",
        text1: "Queued for Deletion",
        text2: "Image will be deleted when internet connection is restored",
      });
      return;
    }

    if (imageToDelete.uploadStatus === "success" && imageToDelete.cloudPath) {
      console.log(
        "☁️ Attempting to delete from cloud:",
        imageToDelete.cloudPath
      );
      try {
        const { error } = await supabase.storage
          .from("images")
          .remove([imageToDelete.cloudPath]);

        if (error) {
          console.error("❌ Cloud deletion failed:", error);
          Toast.show({
            type: "error",
            text1: "Cloud Deletion Failed",
            text2: error.message,
          });
          return;
        }

        console.log("✅ Successfully deleted from cloud");
        Toast.show({
          type: "success",
          text1: "Cloud Deletion",
          text2: "Successfully removed from cloud storage",
        });
      } catch (error) {
        console.error("❌ Cloud deletion error:", error);
        Toast.show({
          type: "error",
          text1: "Cloud Deletion Error",
          text2: error.message,
        });
        return;
      }
    }

    console.log("🗑️ Removing from local storage");
    const updatedImages = savedImages.filter((_, i) => i !== index);
    setSavedImages(updatedImages);
    await AsyncStorage.setItem("savedImages", JSON.stringify(updatedImages));

    console.log("✅ Deletion complete");
    Toast.show({
      type: "success",
      text1: "Deletion Complete",
      text2:
        imageToDelete.uploadStatus === "success"
          ? "Deleted from both cloud and local storage"
          : "Deleted from local storage",
    });
  };

  const processQueuedDeletions = async () => {
    console.log("🔄 Checking for queued deletions...");
    const queuedImages = savedImages.filter(
      (img) => img.uploadStatus === "pending_deletion"
    );

    if (queuedImages.length === 0) {
      console.log("ℹ️ No queued deletions found");
      return;
    }

    console.log(`📤 Processing ${queuedImages.length} queued deletions...`);
    Toast.show({
      type: "info",
      text1: "Processing Queue",
      text2: `Processing ${queuedImages.length} queued deletions...`,
    });

    let successCount = 0;
    let failureCount = 0;

    for (const image of queuedImages) {
      if (!image.cloudPath) continue;

      console.log("🗑️ Processing deletion:", image.cloudPath);
      try {
        const { error } = await supabase.storage
          .from("images")
          .remove([image.cloudPath]);

        if (!error) {
          console.log("✅ Successfully deleted from cloud");
          successCount++;
        } else {
          console.error("❌ Failed to delete from cloud:", error);
          failureCount++;
        }
      } catch (error) {
        console.error("❌ Deletion error:", error);
        failureCount++;
      }
    }

    console.log("🧹 Cleaning up local state...");
    const remainingImages = savedImages.filter(
      (img) => img.uploadStatus !== "pending_deletion"
    );
    setSavedImages(remainingImages);
    await AsyncStorage.setItem("savedImages", JSON.stringify(remainingImages));

    console.log(
      `✅ Queue processing complete. Success: ${successCount}, Failed: ${failureCount}`
    );
    Toast.show({
      type: "success",
      text1: "Queue Processing Complete",
      text2: `Deleted: ${successCount}, Failed: ${failureCount}`,
    });
  };

  const toggleTheme = () => {
    setThemeMode((prevMode) => (prevMode === "dark" ? "light" : "dark"));
  };

  return (
    <View
      style={[styles.container, { backgroundColor: currentTheme.background }]}
    >
      <StatusBar
        barStyle={themeMode === "dark" ? "light-content" : "dark-content"}
      />
      <ConnectionStatus isConnected={isConnected} />
      <Header
        themeMode={themeMode}
        currentTheme={currentTheme}
        onThemeToggle={toggleTheme}
      />
      <ScrollView style={styles.scrollView}>
        <ImageGrid
          images={savedImages}
          currentTheme={currentTheme}
          onImagePress={(image) => {
            setSelectedImage(image);
            setModalVisible(true);
          }}
          onDeleteImage={deleteImage}
        />
      </ScrollView>
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: currentTheme.primary }]}
        onPress={pickImage}
      >
        <Text style={styles.addButtonText}>+</Text>
      </TouchableOpacity>
      <ImageModal
        visible={modalVisible}
        image={selectedImage}
        currentTheme={currentTheme}
        onClose={() => setModalVisible(false)}
      />
      <Toast config={toastConfig} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Constants.statusBarHeight,
  },
  scrollView: {
    flex: 1,
  },
  addButton: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  addButtonText: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
  },
});
