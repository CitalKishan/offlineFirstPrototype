import { useState, useEffect } from "react";
import {
  View,
  Button,
  Image,
  Modal,
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import NetInfo from "@react-native-community/netinfo";
import { createClient } from "@supabase/supabase-js";
import { configData } from "../config";
import Toast from "react-native-toast-message";
import { theme, ThemeMode } from "../utils/theme";

const supabase = createClient(
  configData.supabase.url,
  configData.supabase.anonKey
);

export default function App() {
  const [savedImages, setSavedImages] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const currentTheme = theme[themeMode];

  useEffect(() => {
    loadSavedImages();
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isConnected) {
      uploadPendingImages();
      processQueuedDeletions();
    }
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
    });

    if (!result.canceled) {
      console.log("🖼️ Image selected:", result.assets[0].uri);
      const localUri = result.assets[0].uri;
      const newPath = FileSystem.documentDirectory + `${Date.now()}.jpg`;

      console.log("📁 Copying to local storage:", newPath);
      await FileSystem.copyAsync({ from: localUri, to: newPath });

      const newImage = {
        uri: newPath,
        uploadStatus: "uploading",
        uploadError: null,
        uploadDate: null,
      };

      console.log("💾 Saving to local state...");
      const updatedImages = [newImage, ...savedImages];
      setSavedImages(updatedImages);
      await AsyncStorage.setItem("savedImages", JSON.stringify(updatedImages));

      console.log("🚀 Starting upload process...");
      const uploadedImage = await uploadImageToCloud(newImage);
      const finalImages = [uploadedImage, ...savedImages];
      setSavedImages(finalImages);
      await AsyncStorage.setItem("savedImages", JSON.stringify(finalImages));

      console.log("✅ Image process complete:", uploadedImage.uploadStatus);
      Toast.show({
        type: uploadedImage.uploadStatus === "success" ? "success" : "info",
        text1: uploadedImage.uploadStatus === "success" ? "Success" : "Note",
        text2:
          uploadedImage.uploadStatus === "success"
            ? "Image added and uploaded to cloud"
            : `Image saved locally. ${
                uploadedImage.uploadError || "Will upload when online."
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

  const getUploadStatusColor = (status) => {
    switch (status) {
      case "success":
        return currentTheme.success;
      case "error":
        return currentTheme.error;
      case "uploading":
        return currentTheme.primary;
      case "pending_deletion":
        return currentTheme.error;
      default:
        return currentTheme.pending;
    }
  };

  const getUploadStatusText = (image) => {
    switch (image.uploadStatus) {
      case "success":
        return `✓ Uploaded\n${new Date(image.uploadDate).toLocaleDateString()}`;
      case "error":
        return `❌ Error\n${image.uploadError}`;
      case "uploading":
        return "↑ Uploading...";
      case "pending_deletion":
        return `🗑️ Queued for deletion\n${new Date(
          image.deletionQueuedAt
        ).toLocaleDateString()}`;
      default:
        return "Pending";
    }
  };

  const toggleTheme = () => {
    setThemeMode((prevMode) => (prevMode === "dark" ? "light" : "dark"));
  };

  return (
    <View style={{ flex: 1, backgroundColor: currentTheme.background }}>
      <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
      <View
        style={{
          backgroundColor: isConnected ? "green" : "red",
          padding: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white", fontWeight: "bold" }}>
          {isConnected ? "Online" : "Offline"}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: 16,
        }}
      >
        <Text
          style={{
            fontSize: 24,
            fontWeight: "bold",
            color: currentTheme.text,
          }}
        >
          Offline-First Gallery
        </Text>
        <TouchableOpacity
          style={{
            padding: 8,
            borderRadius: 20,
            width: 40,
            height: 40,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: currentTheme.surface,
          }}
          onPress={toggleTheme}
        >
          <Text
            style={{
              fontSize: 18,
              color: currentTheme.text,
            }}
          >
            {themeMode === "dark" ? "🌙" : "☀️"}
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Button
          title="Choose Image"
          onPress={pickImage}
          color={currentTheme.primary}
        />
        <View style={{ marginVertical: 10 }} />
        <Button
          title="Show Images"
          onPress={() => setModalVisible(true)}
          color={currentTheme.primary}
        />
      </View>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: currentTheme.overlay,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: "90%",
              backgroundColor: currentTheme.surface,
              padding: 20,
              borderRadius: 10,
              maxHeight: "80%",
            }}
          >
            <ScrollView>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                {savedImages.map((img, index) => (
                  <View
                    key={index}
                    style={{
                      position: "relative",
                      margin: 5,
                      backgroundColor: currentTheme.surface,
                    }}
                  >
                    {img.uri && (
                      <>
                        <Image
                          source={{ uri: img.uri }}
                          style={{
                            width: 100,
                            height: 100,
                            borderRadius: 5,
                          }}
                        />
                        <View
                          style={{
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            right: 0,
                            backgroundColor: getUploadStatusColor(
                              img.uploadStatus
                            ),
                            padding: 4,
                          }}
                        >
                          <Text
                            style={{
                              color: currentTheme.text,
                              fontSize: 10,
                              textAlign: "center",
                            }}
                          >
                            {getUploadStatusText(img)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={{
                            position: "absolute",
                            top: 5,
                            right: 5,
                            backgroundColor: currentTheme.error,
                            borderRadius: 12,
                            width: 24,
                            height: 24,
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                          onPress={() => deleteImage(index)}
                        >
                          <Text
                            style={{
                              color: currentTheme.text,
                              fontSize: 16,
                              fontWeight: "bold",
                            }}
                          >
                            ×
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ))}
              </View>
            </ScrollView>
            <Button
              title="Close"
              onPress={() => setModalVisible(false)}
              color={currentTheme.primary}
            />
          </View>
        </View>
      </Modal>
      <Toast />
    </View>
  );
}
