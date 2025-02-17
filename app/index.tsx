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
const STORAGE_BUCKET = configData.supabase.bucketName;
const TOAST_DURATION = configData.toast?.duration || 1000; // Fallback to 1000ms if not defined

// Add constants for AsyncStorage keys
const STORAGE_KEYS = {
  SAVED_IMAGES: "savedImages",
  OFFLINE_DELETE_QUEUE: "offlineDeleteQueue",
  ONLINE_DELETE_QUEUE: "onlineDeleteQueue",
} as const;

interface ImageInfo {
  uri: string;
  uploadStatus: "pending" | "uploading" | "success" | "error";
  uploadError: string | null;
  uploadDate: string | null;
  cloudPath?: string;
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
  const [offlineDeleteQueue, setOfflineDeleteQueue] = useState<ImageInfo[]>([]);
  const [onlineDeleteQueue, setOnlineDeleteQueue] = useState<
    { uri: string; cloudPath: string }[]
  >([]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = Boolean(
        state.isConnected && state.isInternetReachable
      );
      setIsConnected(isConnected);

      if (isConnected) {
        // When connection is restored, add error status images back to upload queue
        setSavedImages((prev) => {
          const failedUploads = prev.filter(
            (img) =>
              img.uploadStatus === "error" || img.uploadStatus === "pending"
          );
          if (failedUploads.length > 0) {
            console.log(`🔄 Retrying ${failedUploads.length} failed uploads`);
            setUploadQueue((prevQueue) => [...prevQueue, ...failedUploads]);
          }
          return prev;
        });

        processUploadQueue();
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

  useEffect(() => {
    if (offlineDeleteQueue.length > 0) {
      processOfflineDeleteQueue();
    }
  }, [offlineDeleteQueue.length]);

  useEffect(() => {
    if (isConnected && onlineDeleteQueue.length > 0) {
      processOnlineDeleteQueue();
    }
  }, [isConnected, onlineDeleteQueue.length]);

  const loadSavedImages = async () => {
    console.log("🔄 Loading saved images and queues...");
    try {
      // Load all data in parallel
      const [savedImagesData, offlineQueueData, onlineQueueData] =
        await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.SAVED_IMAGES),
          AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_DELETE_QUEUE),
          AsyncStorage.getItem(STORAGE_KEYS.ONLINE_DELETE_QUEUE),
        ]);

      // Restore offline delete queue
      if (offlineQueueData) {
        const offlineQueue = JSON.parse(offlineQueueData);
        console.log(
          `📥 Restored offline delete queue: ${offlineQueue.length} items`
        );
        setOfflineDeleteQueue(offlineQueue);
      }

      // Restore online delete queue
      if (onlineQueueData) {
        const onlineQueue = JSON.parse(onlineQueueData);
        console.log(
          `☁️ Restored online delete queue: ${onlineQueue.length} items`
        );
        setOnlineDeleteQueue(onlineQueue);
      }

      // Load saved images (existing logic)
      if (savedImagesData) {
        const parsed = JSON.parse(savedImagesData);

        // Wait for all file existence checks to complete
        const validImagesPromises = await Promise.all(
          parsed.map(async (img: ImageInfo) => {
            if (!img.uri || typeof img.uri !== "string") {
              return null;
            }

            try {
              const fileInfo = await FileSystem.getInfoAsync(img.uri);
              if (fileInfo.exists) {
                // If image is pending deletion and we're online, process it immediately
                if (img.uploadStatus === "pending_deletion" && isConnected) {
                  console.log("🗑️ Processing pending deletion:", img.cloudPath);
                  if (img.cloudPath) {
                    try {
                      const { error } = await supabase.storage
                        .from(STORAGE_BUCKET)
                        .remove([img.cloudPath]);

                      if (!error) {
                        console.log(
                          "✅ Successfully deleted from cloud during load"
                        );
                        // Don't include this image in valid images
                        return null;
                      }
                    } catch (error) {
                      console.error(
                        "❌ Cloud deletion error during load:",
                        error
                      );
                    }
                  }
                }
                // Keep the existing status for other images
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

        // Add both pending and error status images to upload queue
        const imagesToUpload = validImages.filter(
          (img) =>
            img.uploadStatus === "pending" || img.uploadStatus === "error"
        );
        if (imagesToUpload.length > 0) {
          console.log(
            `📤 Adding ${imagesToUpload.length} images to upload queue (pending + failed)`
          );
          setUploadQueue((prev) => [...prev, ...imagesToUpload]);
        }
      } else {
        console.log("No saved images found");
        setSavedImages([]);
      }
    } catch (error) {
      console.error("❌ Error loading data:", error);
      Toast.show({
        type: "error",
        text1: "Error Loading Data",
        text2: "Failed to restore app state",
        visibilityTime: TOAST_DURATION,
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
        visibilityTime: TOAST_DURATION,
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
          STORAGE_KEYS.SAVED_IMAGES,
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
      console.log("📶 No internet connection, keeping previous status");
      return {
        ...imageInfo,
        uploadStatus: imageInfo.uploadStatus, // Keep existing status
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
        .from(STORAGE_BUCKET)
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
        .from(STORAGE_BUCKET)
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

      // Set status back to pending for network errors
      const isNetworkError =
        errorMessage.toLowerCase().includes("network") || !isConnected;

      return {
        ...imageInfo,
        uploadStatus: isNetworkError ? "pending" : "error",
        uploadError: errorMessage,
      };
    }
  };

  const processUploadQueue = async () => {
    if (!isConnected || uploadQueue.length === 0) return;

    console.log(`🔄 Processing upload queue: ${uploadQueue.length} items`);
    // console.log("🔄 Upload queue:", uploadQueue);

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

        // Check if file still exists before processing
        try {
          const fileInfo = await FileSystem.getInfoAsync(image.uri);
          if (!fileInfo.exists) {
            console.log(`❌ File no longer exists: ${image.uri}`);
            // Remove from upload queue if file doesn't exist
            setUploadQueue((prev) =>
              prev.filter((img) => img.uri !== image.uri)
            );
            // Remove from saved images if file doesn't exist
            setSavedImages((prev) =>
              prev.filter((img) => img.uri !== image.uri)
            );
            continue;
          }
        } catch (error) {
          console.error(
            `❌ Error checking file existence: ${image.uri}`,
            error
          );
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
                STORAGE_KEYS.SAVED_IMAGES,
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
              visibilityTime: TOAST_DURATION,
            });
          } else if (result.uploadStatus === "error") {
            Toast.show({
              type: "error",
              text1: "Upload Failed",
              text2: result.uploadError || "Unknown error occurred",
              visibilityTime: TOAST_DURATION,
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
        visibilityTime: TOAST_DURATION,
      });
    }
  };

  const deleteImage = async (index: number) => {
    const imageToDelete = savedImages[index];
    if (!imageToDelete) return;

    console.log("🗑️ Starting delete process for image:", imageToDelete);

    // Add to offline delete queue and persist
    const newOfflineQueue = [...offlineDeleteQueue, imageToDelete];
    setOfflineDeleteQueue(newOfflineQueue);
    await AsyncStorage.setItem(
      STORAGE_KEYS.OFFLINE_DELETE_QUEUE,
      JSON.stringify(newOfflineQueue)
    );

    // Remove from upload queue if pending
    if (imageToDelete.uploadStatus === "pending") {
      console.log("📤 Removing from upload queue...");
      setUploadQueue((prev) =>
        prev.filter((img) => img.uri !== imageToDelete.uri)
      );
    }

    Toast.show({
      type: "info",
      text1: "Deletion Started",
      text2: "Image queued for deletion",
      visibilityTime: TOAST_DURATION,
    });
  };

  const processOfflineDeleteQueue = async () => {
    console.log(
      `🗑️ Processing offline delete queue: ${offlineDeleteQueue.length} items`
    );

    try {
      const imageToDelete = offlineDeleteQueue[0];

      // Delete from local storage
      await FileSystem.deleteAsync(imageToDelete.uri, { idempotent: true });
      console.log("✅ File deleted from local storage:", imageToDelete.uri);

      // If image was uploaded, add to online delete queue
      if (imageToDelete.uploadStatus === "success" && imageToDelete.cloudPath) {
        const newOnlineQueue = [
          ...onlineDeleteQueue,
          {
            uri: imageToDelete.uri,
            cloudPath: imageToDelete.cloudPath,
          },
        ];
        setOnlineDeleteQueue(newOnlineQueue);
        // Persist online queue
        await AsyncStorage.setItem(
          STORAGE_KEYS.ONLINE_DELETE_QUEUE,
          JSON.stringify(newOnlineQueue)
        );
      }

      // Remove from saved images
      const updatedImages = savedImages.filter(
        (img) => img.uri !== imageToDelete.uri
      );
      setSavedImages(updatedImages);
      await AsyncStorage.setItem(
        STORAGE_KEYS.SAVED_IMAGES,
        JSON.stringify(updatedImages)
      );

      // Update offline queue
      const newOfflineQueue = offlineDeleteQueue.slice(1);
      setOfflineDeleteQueue(newOfflineQueue);
      await AsyncStorage.setItem(
        STORAGE_KEYS.OFFLINE_DELETE_QUEUE,
        JSON.stringify(newOfflineQueue)
      );

      Toast.show({
        type: "success",
        text1: "Local Deletion Complete",
        text2: "Image deleted from device storage",
        visibilityTime: TOAST_DURATION,
      });
    } catch (error) {
      console.error("❌ Error in offline deletion:", error);
      Toast.show({
        type: "error",
        text1: "Deletion Error",
        text2: "Failed to delete file from local storage",
        visibilityTime: TOAST_DURATION,
      });

      // Update offline queue even on failure
      const newOfflineQueue = offlineDeleteQueue.slice(1);
      setOfflineDeleteQueue(newOfflineQueue);
      await AsyncStorage.setItem(
        STORAGE_KEYS.OFFLINE_DELETE_QUEUE,
        JSON.stringify(newOfflineQueue)
      );
    }
  };

  const processOnlineDeleteQueue = async () => {
    if (!isConnected || onlineDeleteQueue.length === 0) return;

    console.log(
      `☁️ Processing online delete queue: ${onlineDeleteQueue.length} items`
    );

    try {
      const itemToDelete = onlineDeleteQueue[0];

      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([itemToDelete.cloudPath]);

      if (error) throw error;

      console.log(
        "✅ Successfully deleted from cloud:",
        itemToDelete.cloudPath
      );

      // Update and persist queue
      const newQueue = onlineDeleteQueue.slice(1);
      setOnlineDeleteQueue(newQueue);
      await AsyncStorage.setItem(
        STORAGE_KEYS.ONLINE_DELETE_QUEUE,
        JSON.stringify(newQueue)
      );

      Toast.show({
        type: "success",
        text1: "Cloud Deletion Complete",
        text2: "Image deleted from cloud storage",
        visibilityTime: TOAST_DURATION,
      });
    } catch (error) {
      console.error("❌ Error in online deletion:", error);
      Toast.show({
        type: "error",
        text1: "Cloud Deletion Error",
        text2: "Failed to delete from cloud. Will retry later.",
        visibilityTime: TOAST_DURATION,
      });
    }
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
