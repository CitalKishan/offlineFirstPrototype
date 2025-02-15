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
import Toast from "react-native-toast-message";
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

export default function App() {
  const [savedImages, setSavedImages] = useState<ImageInfo[]>([]);
  const [saveQueue, setSaveQueue] = useState<ImageInfo[]>([]);
  const [uploadQueue, setUploadQueue] = useState<ImageInfo[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isConnected, setIsConnected] = useState(true);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const currentTheme = theme[themeMode];

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

  const loadSavedImages = async () => {
    console.log("🔄 Loading saved images...");
    const saved = await AsyncStorage.getItem("savedImages");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const validImages = parsed.filter((img) => img.uri);
        console.log(`✅ Loaded ${validImages.length} images successfully`);
        setSavedImages(validImages);
      } catch (error) {
        console.error("❌ Error loading images:", error);
        setSavedImages([]);
      }
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
      const processedImages = await Promise.all(
        saveQueue.map(async (imageInfo) => {
          const newPath =
            FileSystem.documentDirectory +
            `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;

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
        (img): img is ImageInfo => img !== null
      );

      if (validImages.length > 0) {
        console.log(
          `⏳ Step 5: Moving ${validImages.length} images to upload queue`
        );
        setSavedImages((prev) => [...prev, ...validImages]);
        setUploadQueue((prev) => [...prev, ...validImages]);
        await AsyncStorage.setItem("savedImages", JSON.stringify(savedImages));
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
      const fileName = fileUri.split("/").pop() || "";
      const fileType = "image/jpeg";

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
        });

      if (error) throw error;

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
      return {
        ...imageInfo,
        uploadStatus: "error",
        uploadError: error instanceof Error ? error.message : "Upload failed",
      };
    }
  };

  const processUploadQueue = async () => {
    if (!isConnected || uploadQueue.length === 0) return;

    console.log(`🔄 Processing upload queue: ${uploadQueue.length} items`);

    try {
      const results = await Promise.all(
        uploadQueue.map((image) => uploadImageToCloud(image))
      );

      const successCount = results.filter(
        (img) => img.uploadStatus === "success"
      ).length;

      console.log(`📊 Upload Summary:
      Total: ${results.length}
      Success: ${successCount}
      Failed: ${results.length - successCount}
      `);

      // Update saved images with upload results
      setSavedImages((prev) =>
        prev.map((img) => {
          const uploadedImage = results.find(
            (result) => result.uri === img.uri
          );
          return uploadedImage || img;
        })
      );

      setUploadQueue([]);
      await AsyncStorage.setItem("savedImages", JSON.stringify(savedImages));

      Toast.show({
        type: successCount === results.length ? "success" : "warning",
        text1: "Upload Complete",
        text2: `Successfully uploaded ${successCount} of ${results.length} images`,
      });
    } catch (error) {
      console.error(
        "❌ Error processing upload queue:",
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const deleteImage = async (index) => {
    const imageToDelete = savedImages[index];
    console.log("🗑️ Starting delete process for image:", imageToDelete);

    if (!isConnected && imageToDelete.uploadStatus === "success") {
      console.log("📶 Offline detected, queueing for deletion");
      const updatedImages = savedImages.map((img, i) => {
        if (i === index) {
          return {
            ...img,
            uploadStatus: "pending_deletion",
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
      <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
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
      <Toast />
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
