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

export default function App() {
  const [savedImages, setSavedImages] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isConnected, setIsConnected] = useState(true);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const currentTheme = theme[themeMode];

  useEffect(() => {
    loadSavedImages();
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected && state.isInternetReachable;
      console.log("Connection status:", isConnected ? "online" : "offline");
      setIsConnected(isConnected);
      if (isConnected) {
        uploadPendingImages();
        processQueuedDeletions();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isConnected]);

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

  const uploadImageToCloud = async (imageInfo) => {
    console.log("📤 Starting cloud upload for:", imageInfo.uri);
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
      const fileName = fileUri.split("/").pop();
      const fileExt = fileName.split(".").pop();
      const fileType = `image/${fileExt}`;
      console.log("📋 Preparing upload:", { fileName, fileType });

      const formData = new FormData();
      formData.append("file", {
        uri: fileUri,
        name: fileName,
        type: fileType,
      });

      console.log("🚀 Initiating upload to Supabase...");
      const { data, error } = await supabase.storage
        .from("images")
        .upload(fileName, formData, {
          contentType: "multipart/form-data",
        });

      if (error) {
        console.error("❌ Upload Error:", error);
        return {
          ...imageInfo,
          uploadStatus: "error",
          uploadError: error.message,
        };
      }

      console.log("✅ Upload successful:", data.path);
      return {
        ...imageInfo,
        uploadStatus: "success",
        uploadDate: new Date().toISOString(),
        cloudPath: data.path,
      };
    } catch (error) {
      console.error("❌ Upload error:", error);
      return {
        ...imageInfo,
        uploadStatus: "error",
        uploadError: error.message,
      };
    }
  };

  const uploadPendingImages = async () => {
    console.log("🔄 Checking for pending images...");
    const pendingImages = savedImages.filter(
      (img) => img.uploadStatus === "pending" || img.uploadStatus === "error"
    );

    if (pendingImages.length === 0) {
      console.log("ℹ️ No pending images found");
      return;
    }

    console.log(
      `📤 Starting upload of ${pendingImages.length} pending images...`
    );
    Toast.show({
      type: "info",
      text1: "Uploading",
      text2: `Starting upload of ${pendingImages.length} pending images...`,
    });

    const updatedImages = [...savedImages];
    for (const pendingImage of pendingImages) {
      const index = updatedImages.findIndex(
        (img) => img.uri === pendingImage.uri
      );
      if (index === -1) continue;

      console.log(`📤 Processing image ${index + 1}/${pendingImages.length}`);
      updatedImages[index] = { ...pendingImage, uploadStatus: "uploading" };
      setSavedImages(updatedImages);
      await AsyncStorage.setItem("savedImages", JSON.stringify(updatedImages));

      const uploadedImage = await uploadImageToCloud(pendingImage);
      updatedImages[index] = uploadedImage;
      setSavedImages(updatedImages);
      await AsyncStorage.setItem("savedImages", JSON.stringify(updatedImages));
    }

    const successCount = updatedImages.filter(
      (img) => img.uploadStatus === "success"
    ).length;

    console.log(
      `✅ Upload complete: ${successCount}/${pendingImages.length} successful`
    );
    Toast.show({
      type: "success",
      text1: "Upload Complete",
      text2: `Successfully uploaded ${successCount} out of ${pendingImages.length} images.`,
    });
  };

  const pickImage = async () => {
    console.log("📸 Opening image picker...");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      allowsMultipleSelection: true,
      // selectionLimit: 10,
    });

    if (!result.canceled) {
      console.log(`🖼️ ${result.assets.length} images selected`);

      const newImages = await Promise.all(
        result.assets.map(async (asset) => {
          const localUri = asset.uri;
          const newPath =
            FileSystem.documentDirectory +
            `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;

          console.log("📁 Copying to local storage:", newPath);
          await FileSystem.copyAsync({ from: localUri, to: newPath });

          return {
            uri: newPath,
            uploadStatus: "uploading",
            uploadError: null,
            uploadDate: null,
          };
        })
      );

      console.log("💾 Saving to local state...");
      const updatedImages = [...newImages, ...savedImages];
      setSavedImages(updatedImages);
      await AsyncStorage.setItem("savedImages", JSON.stringify(updatedImages));

      // Upload each image
      console.log("🚀 Starting upload process for multiple images...");
      const uploadedImages = await Promise.all(
        newImages.map(async (newImage) => {
          const uploadedImage = await uploadImageToCloud(newImage);
          return uploadedImage;
        })
      );

      const finalImages = [...uploadedImages, ...savedImages];
      setSavedImages(finalImages);
      await AsyncStorage.setItem("savedImages", JSON.stringify(finalImages));

      // Show summary toast
      const successCount = uploadedImages.filter(
        (img) => img.uploadStatus === "success"
      ).length;
      console.log(
        "✅ Image process complete:",
        `${successCount}/${uploadedImages.length} uploaded`
      );

      Toast.show({
        type: successCount === uploadedImages.length ? "success" : "info",
        text1:
          successCount === uploadedImages.length ? "Success" : "Upload Status",
        text2: `${successCount} of ${uploadedImages.length} images ${
          successCount === 1 ? "was" : "were"
        } uploaded successfully${
          successCount < uploadedImages.length
            ? `. ${
                uploadedImages.length - successCount
              } will upload when online.`
            : "."
        }`,
      });
    } else {
      console.log("❌ Image selection cancelled");
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
