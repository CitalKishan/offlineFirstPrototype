import { useState, useEffect } from "react";
import {
  View,
  Button,
  Image,
  Modal,
  ScrollView,
  TouchableOpacity,
  Text,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import NetInfo from "@react-native-community/netinfo";
import { createClient } from "@supabase/supabase-js";
import { configData } from "../config";

const supabase = createClient(
  configData.supabase.url,
  configData.supabase.anonKey
);

const theme = {
  dark: {
    background: "#121212",
    surface: "#1E1E1E",
    primary: "#BB86FC",
    text: "#FFFFFF",
    error: "#CF6679",
    overlay: "rgba(0,0,0,0.9)",
    success: "#4CAF50",
    pending: "#FFA726",
  },
};

export default function App() {
  const [savedImages, setSavedImages] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    loadSavedImages();
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // When isConnected changes to true, check and upload pending images
    if (isConnected) {
      uploadPendingImages();
    }
  }, [isConnected]);

  const loadSavedImages = async () => {
    const saved = await AsyncStorage.getItem("savedImages");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const validImages = parsed.filter((img) => img.uri);
        setSavedImages(validImages);
      } catch (error) {
        console.error("Error loading images:", error);
        setSavedImages([]);
      }
    }
  };

  const uploadImageToCloud = async (imageInfo) => {
    if (!isConnected) {
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

      const formData = new FormData();
      formData.append("file", {
        uri: fileUri,
        name: fileName,
        type: fileType,
      });

      const { data, error } = await supabase.storage
        .from("images")
        .upload(fileName, formData, {
          contentType: "multipart/form-data",
        });

      if (error) {
        console.error("Upload Error:", error);
        return {
          ...imageInfo,
          uploadStatus: "error",
          uploadError: error.message,
        };
      }

      console.log("Uploaded:", data.path);
      return {
        ...imageInfo,
        uploadStatus: "success",
        uploadDate: new Date().toISOString(),
        cloudPath: data.path,
      };
    } catch (error) {
      console.error("Error uploading:", error);
      return {
        ...imageInfo,
        uploadStatus: "error",
        uploadError: error.message,
      };
    }
  };

  const uploadPendingImages = async () => {
    // Get pending images
    const pendingImages = savedImages.filter(
      (img) => img.uploadStatus === "pending" || img.uploadStatus === "error"
    );

    if (pendingImages.length === 0) return;

    console.log(
      "Internet connection restored. Starting upload of pending images..."
    );
    Alert.alert(
      "Uploading",
      `Starting upload of ${pendingImages.length} pending images...`
    );

    // Upload each pending image
    const updatedImages = [...savedImages];
    for (const pendingImage of pendingImages) {
      const index = updatedImages.findIndex(
        (img) => img.uri === pendingImage.uri
      );
      if (index === -1) continue;

      console.log(`Uploading image ${index + 1} of ${pendingImages.length}`);

      // Update status to uploading
      updatedImages[index] = { ...pendingImage, uploadStatus: "uploading" };
      setSavedImages(updatedImages);
      await AsyncStorage.setItem("savedImages", JSON.stringify(updatedImages));

      // Attempt to upload
      const uploadedImage = await uploadImageToCloud(pendingImage);
      updatedImages[index] = uploadedImage;
      setSavedImages(updatedImages);
      await AsyncStorage.setItem("savedImages", JSON.stringify(updatedImages));
    }

    const successCount = updatedImages.filter(
      (img) => img.uploadStatus === "success"
    ).length;
    console.log(
      `Upload complete. ${successCount}/${pendingImages.length} images uploaded successfully`
    );
    Alert.alert(
      "Upload Complete",
      `Successfully uploaded ${successCount} out of ${pendingImages.length} images.`
    );
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
    });

    if (!result.canceled) {
      const localUri = result.assets[0].uri;
      const newPath = FileSystem.documentDirectory + `${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: localUri, to: newPath });

      const newImage = {
        uri: newPath,
        uploadStatus: "uploading",
        uploadError: null,
        uploadDate: null,
      };

      // Add image to state immediately with "uploading" status
      const updatedImages = [newImage, ...savedImages];
      setSavedImages(updatedImages);
      await AsyncStorage.setItem("savedImages", JSON.stringify(updatedImages));

      // Start upload process
      const uploadedImage = await uploadImageToCloud(newImage);

      // Update state with upload result
      const finalImages = [uploadedImage, ...savedImages];
      setSavedImages(finalImages);
      await AsyncStorage.setItem("savedImages", JSON.stringify(finalImages));

      Alert.alert(
        uploadedImage.uploadStatus === "success" ? "Success" : "Note",
        uploadedImage.uploadStatus === "success"
          ? "Image added and uploaded to cloud"
          : "Image saved locally. " +
              (uploadedImage.uploadError || "Will upload when online.")
      );
    }
  };

  const deleteImage = async (index) => {
    const imageToDelete = savedImages[index];

    // Delete from cloud if it was uploaded successfully
    if (imageToDelete.uploadStatus === "success" && imageToDelete.cloudPath) {
      try {
        const { error } = await supabase.storage
          .from("images")
          .remove([imageToDelete.cloudPath]);

        if (error) {
          console.error("Error deleting from cloud:", error);
          Alert.alert("Error", "Failed to delete from cloud storage");
          return;
        }
      } catch (error) {
        console.error("Error deleting from cloud:", error);
        Alert.alert("Error", "Failed to delete from cloud storage");
        return;
      }
    }

    // Delete from local storage
    const updatedImages = savedImages.filter((_, i) => i !== index);
    setSavedImages(updatedImages);
    await AsyncStorage.setItem("savedImages", JSON.stringify(updatedImages));
    Alert.alert("Success", "Image deleted from both local and cloud storage");
  };

  const getUploadStatusColor = (status) => {
    switch (status) {
      case "success":
        return theme.dark.success;
      case "error":
        return theme.dark.error;
      case "uploading":
        return theme.dark.primary;
      default:
        return theme.dark.pending;
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
      default:
        return "Pending";
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.dark.background }}>
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

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Button
          title="Choose Image"
          onPress={pickImage}
          color={theme.dark.primary}
        />
        <View style={{ marginVertical: 10 }} />
        <Button
          title="Show Images"
          onPress={() => setModalVisible(true)}
          color={theme.dark.primary}
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
            backgroundColor: theme.dark.overlay,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: "90%",
              backgroundColor: theme.dark.surface,
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
                  <View key={index} style={{ position: "relative", margin: 5 }}>
                    {img.uri && (
                      <>
                        <Image
                          source={{ uri: img.uri }}
                          style={{ width: 100, height: 100, borderRadius: 5 }}
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
                              color: theme.dark.text,
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
                            backgroundColor: theme.dark.error,
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
                              color: theme.dark.text,
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
              color={theme.dark.primary}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
